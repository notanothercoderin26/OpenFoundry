// IcebergToObjectStoreIndexer — reads an Iceberg table from Lakekeeper REST and
// projects each row into an HTTP PUT against object-database-service. This is
// the production stand-in for tools/online-retail/seed_object_database.py.
//
// CLI:
//   --source-table         <iceberg ref>     e.g. lakekeeper.default.online_retail_clean
//   --target-tenant        <string>          e.g. default
//   --target-type-id       <uuid>            object_type_id in the ontology
//   --id-column            <string>          column name in source for object id
//   --object-database-url  <url>             http://object-database-service.openfoundry.svc:8080
//   --catalog              <string>          spark catalog name (default: lakekeeper)
//   --catalog-uri          <url>             Lakekeeper REST URL
//   [--internal-token      <string>]         optional X-Internal-Token header
//   [--limit               <long>]           cap rows for smoke runs (0 = no cap)
//
// Exit codes:
//   0  success
//   1  Spark/IO error
//   2  CLI parse error
//
// Design notes:
//   - Uses `df.toJSON.foreachPartition` so each row becomes a serialised JSON
//     object and Spark handles the parquet → typed-row → JSON conversion. The
//     handler then only has to extract id_column and forward.
//   - HTTP client is per-partition (reused across rows of one task) — at PoC
//     scale ~5K rows/min sequential. For prod, bulk endpoint or async pool.
//   - Apache Arrow vectorised reader is disabled (SIGSEGV on arm64+JDK17 with
//     Iceberg 1.5; see docs/poc-online-retail/NEXT-STEPS.md §4.4).
package com.openfoundry.indexer

import org.apache.spark.sql.SparkSession
import scopt.OParser

import java.net.URI
import java.net.http.{HttpClient, HttpRequest, HttpResponse}
import java.nio.charset.StandardCharsets
import java.time.Duration
import scala.util.{Failure, Success, Try}

final case class IndexerArgs(
  sourceTable:       String  = "",
  targetTenant:      String  = "default",
  targetTypeId:      String  = "",
  idColumn:          String  = "",
  objectDatabaseUrl: String  = "http://object-database-service.openfoundry.svc:8080",
  internalToken:     String  = "",
  catalog:           String  = "lakekeeper",
  catalogUri:        String  = "",
  limit:             Long    = 0L,
)

object IcebergToObjectStoreIndexer {

  private val parser = {
    val b = OParser.builder[IndexerArgs]
    import b._
    OParser.sequence(
      programName("iceberg-to-objectstore-indexer"),
      head("iceberg-to-objectstore-indexer"),
      opt[String]("source-table").required().action((v, a) => a.copy(sourceTable = v)),
      opt[String]("target-tenant").action((v, a) => a.copy(targetTenant = v)),
      opt[String]("target-type-id").required().action((v, a) => a.copy(targetTypeId = v)),
      opt[String]("id-column").required().action((v, a) => a.copy(idColumn = v)),
      opt[String]("object-database-url").action((v, a) => a.copy(objectDatabaseUrl = v)),
      opt[String]("internal-token").action((v, a) => a.copy(internalToken = v)),
      opt[String]("catalog").action((v, a) => a.copy(catalog = v)),
      opt[String]("catalog-uri").action((v, a) => a.copy(catalogUri = v)),
      opt[Long]("limit").action((v, a) => a.copy(limit = v)),
    )
  }

  def main(rawArgs: Array[String]): Unit = {
    val args = OParser.parse(parser, rawArgs, IndexerArgs()).getOrElse {
      System.err.println("[indexer] failed to parse args"); sys.exit(2)
    }
    log(args, s"start source=${args.sourceTable} target_type=${args.targetTypeId} id_col=${args.idColumn}")

    val spark = buildSession(args)
    try {
      Try(runIndex(spark, args)) match {
        case Success(rowCount) =>
          log(args, s"complete rows_processed=$rowCount source=${args.sourceTable}")
        case Failure(err) =>
          log(args, s"failed: ${err.getClass.getSimpleName}: ${err.getMessage}")
          err.printStackTrace(System.err)
          sys.exit(1)
      }
    } finally spark.stop()
  }

  private def buildSession(args: IndexerArgs): SparkSession = {
    val b = SparkSession
      .builder()
      .appName(s"indexer-${args.sourceTable.replace('.', '-')}")
      .config("spark.sql.extensions", "org.apache.iceberg.spark.extensions.IcebergSparkSessionExtensions")
      .config(s"spark.sql.catalog.${args.catalog}", "org.apache.iceberg.spark.SparkCatalog")
      .config(s"spark.sql.catalog.${args.catalog}.type", "rest")
      // Apache Arrow native reader SIGSEGVs on arm64+JDK17 with Iceberg 1.5.x.
      .config("spark.sql.parquet.enableVectorizedReader", "false")
      .config("spark.sql.iceberg.vectorization.enabled", "false")
    val withCatalog = if (args.catalogUri.nonEmpty) {
      b.config(s"spark.sql.catalog.${args.catalog}.uri", args.catalogUri)
    } else b
    withCatalog.getOrCreate()
  }

  private def runIndex(spark: SparkSession, args: IndexerArgs): Long = {
    var df = spark.read.table(args.sourceTable)
    if (args.limit > 0) df = df.limit(args.limit.toInt)

    // Materialise a count first so we can report it; df itself is reused below.
    val total = df.count()
    log(args, s"row count to index: $total")

    val targetTenant      = args.targetTenant
    val targetTypeId      = args.targetTypeId
    val idColumn          = args.idColumn
    val objectDatabaseUrl = args.objectDatabaseUrl.stripSuffix("/")
    val internalToken     = args.internalToken

    df.toJSON.foreachPartition { partition: Iterator[String] =>
      val client = HttpClient.newBuilder()
        .connectTimeout(Duration.ofSeconds(5))
        .build()
      partition.foreach { rowJson =>
        val id = extractIdField(rowJson, idColumn)
        if (id != null && id.nonEmpty) {
          val body = buildPutBody(targetTypeId, rowJson)
          val builder = HttpRequest.newBuilder()
            .uri(URI.create(s"$objectDatabaseUrl/api/v1/object-database/objects/$targetTenant/$id"))
            .timeout(Duration.ofSeconds(15))
            .header("Content-Type", "application/json")
            .PUT(HttpRequest.BodyPublishers.ofString(body, StandardCharsets.UTF_8))
          if (internalToken.nonEmpty) builder.header("X-Internal-Token", internalToken)
          val resp = client.send(builder.build(), HttpResponse.BodyHandlers.discarding())
          val sc = resp.statusCode()
          if (sc < 200 || sc >= 300) {
            System.err.println(s"[indexer] non-2xx for id=$id status=$sc")
          }
        }
      }
    }

    total
  }

  // extractIdField parses a serialised JSON object and returns the raw string
  // value of `key`. Cheap hand-rolled extractor — avoids pulling in Jackson
  // here (already on the classpath via Spark, but staying minimal).
  private def extractIdField(json: String, key: String): String = {
    // Match  "key":<value>   handling string and numeric values.
    val needle = "\"" + key + "\""
    var idx = json.indexOf(needle)
    if (idx < 0) return null
    idx += needle.length
    while (idx < json.length && (json.charAt(idx) == ' ' || json.charAt(idx) == ':')) idx += 1
    if (idx >= json.length) return null
    val first = json.charAt(idx)
    if (first == '"') {
      val end = json.indexOf('"', idx + 1)
      if (end < 0) return null
      return json.substring(idx + 1, end)
    }
    // numeric / bool / null — read until comma or closing brace
    val start = idx
    while (idx < json.length && json.charAt(idx) != ',' && json.charAt(idx) != '}' && json.charAt(idx) != ' ') idx += 1
    json.substring(start, idx)
  }

  // buildPutBody wraps the row JSON in the writeObjectRequest shape that
  // object-database-service handlers expect (see internal/handlers/handlers.go).
  private def buildPutBody(typeId: String, payload: String): String = {
    val now = System.currentTimeMillis()
    s"""{"type_id":"$typeId","version":$now,"payload":$payload,"updated_at_ms":$now,"markings":[]}"""
  }

  private def log(args: IndexerArgs, msg: String): Unit =
    println(s"[indexer source=${args.sourceTable} type=${args.targetTypeId}] $msg")
}

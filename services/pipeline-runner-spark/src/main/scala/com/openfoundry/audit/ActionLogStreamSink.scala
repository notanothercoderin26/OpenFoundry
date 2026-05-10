// ActionLogStreamSink — Spark Structured Streaming consumer that reads the
// `ontology.actions.applied.v1` Kafka topic emitted by ontology-actions-service
// and appends each event to the Iceberg `lakekeeper.default.action_log` table.
//
// Design (P4 of docs/poc-online-retail/RUNTIME-INDEXER.md):
//   - Cassandra (object-database-service) is canonical for object STATE.
//   - Iceberg `action_log` is canonical for the immutable AUDIT TIMELINE.
//   - This consumer is the bridge: it cannot mutate object state, only append
//     to action_log, so the streaming job is always-safe to restart.
//
// CLI:
//   --kafka-brokers   <csv>     bootstrap servers, e.g. openfoundry-kafka-bootstrap.kafka.svc:9092
//   --topic           <string>  default: ontology.actions.applied.v1
//   --table           <string>  default: lakekeeper.default.action_log
//   --catalog         <string>  default: lakekeeper
//   --catalog-uri     <url>
//   --checkpoint      <s3 path> default: s3a://openfoundry-iceberg/_checkpoints/action_log
//   --trigger-seconds <int>     default: 30
//
// First run requirement: the `action_log` table must exist. Create it with
// the DDL in infra/dev/action-log-sink.yaml (commented at the top).
package com.openfoundry.audit

import org.apache.spark.sql.{DataFrame, SparkSession}
import org.apache.spark.sql.functions.{col, from_json}
import org.apache.spark.sql.streaming.Trigger
import org.apache.spark.sql.types._
import scopt.OParser

final case class ActionLogArgs(
  kafkaBrokers:   String = "openfoundry-kafka-bootstrap.kafka.svc:9092",
  topic:          String = "ontology.actions.applied.v1",
  table:          String = "lakekeeper.default.action_log",
  catalog:        String = "lakekeeper",
  catalogUri:     String = "",
  checkpoint:     String = "s3a://openfoundry-iceberg/_checkpoints/action_log",
  triggerSeconds: Int    = 30,
)

object ActionLogStreamSink {

  private val parser = {
    val b = OParser.builder[ActionLogArgs]
    import b._
    OParser.sequence(
      programName("action-log-stream-sink"),
      head("action-log-stream-sink"),
      opt[String]("kafka-brokers").action((v, a) => a.copy(kafkaBrokers = v)),
      opt[String]("topic").action((v, a) => a.copy(topic = v)),
      opt[String]("table").action((v, a) => a.copy(table = v)),
      opt[String]("catalog").action((v, a) => a.copy(catalog = v)),
      opt[String]("catalog-uri").action((v, a) => a.copy(catalogUri = v)),
      opt[String]("checkpoint").action((v, a) => a.copy(checkpoint = v)),
      opt[Int]("trigger-seconds").action((v, a) => a.copy(triggerSeconds = v)),
    )
  }

  // Schema mirrors the envelope written by libs/ontology-kernel/handlers/actions/
  // side_effects.go:publishActionAuditToKafka.
  private val envelopeSchema = StructType(Seq(
    StructField("event_id",              StringType, nullable = false),
    StructField("action_type_id",        StringType, nullable = false),
    StructField("action_name",           StringType, nullable = false),
    StructField("object_type_id",        StringType, nullable = false),
    StructField("object_id",             StringType, nullable = true),
    StructField("tenant",                StringType, nullable = false),
    StructField("actor_sub",             StringType, nullable = false),
    StructField("actor_email",           StringType, nullable = true),
    StructField("organization_id",       StringType, nullable = true),
    StructField("status",                StringType, nullable = false),
    // Free-form JSON shapes — keep as STRING for forward compatibility;
    // dashboards can json_parse() at query time.
    StructField("parameters",            StringType, nullable = true),
    StructField("previous_state",        StringType, nullable = true),
    StructField("new_state",             StringType, nullable = true),
    StructField("target_classification", StringType, nullable = true),
    StructField("applied_at_ms",         LongType,   nullable = false),
  ))

  def main(rawArgs: Array[String]): Unit = {
    val args = OParser.parse(parser, rawArgs, ActionLogArgs()).getOrElse {
      System.err.println("[action-log-sink] failed to parse args"); sys.exit(2)
    }

    val spark = buildSession(args)
    val raw = spark.readStream
      .format("kafka")
      .option("kafka.bootstrap.servers", args.kafkaBrokers)
      .option("subscribe", args.topic)
      .option("startingOffsets", "earliest")
      .load()

    val parsed: DataFrame = raw
      .selectExpr("CAST(value AS STRING) AS json", "timestamp AS kafka_ts")
      .select(from_json(col("json"), envelopeSchema).as("evt"), col("kafka_ts"))
      .select("evt.*", "kafka_ts")

    parsed.writeStream
      .format("iceberg")
      .outputMode("append")
      .option("checkpointLocation", args.checkpoint)
      .trigger(Trigger.ProcessingTime(s"${args.triggerSeconds} seconds"))
      .toTable(args.table)
      .awaitTermination()
  }

  private def buildSession(args: ActionLogArgs): SparkSession = {
    val b = SparkSession.builder()
      .appName(s"action-log-sink-${args.topic.replace('.', '-')}")
      .config("spark.sql.extensions", "org.apache.iceberg.spark.extensions.IcebergSparkSessionExtensions")
      .config(s"spark.sql.catalog.${args.catalog}", "org.apache.iceberg.spark.SparkCatalog")
      .config(s"spark.sql.catalog.${args.catalog}.type", "rest")
      .config("spark.sql.parquet.enableVectorizedReader", "false")
      .config("spark.sql.iceberg.vectorization.enabled", "false")
    val withCatalog = if (args.catalogUri.nonEmpty) {
      b.config(s"spark.sql.catalog.${args.catalog}.uri", args.catalogUri)
    } else b
    withCatalog.getOrCreate()
  }
}

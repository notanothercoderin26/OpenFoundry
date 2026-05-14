// Package analyticallogic owns the analytical_expressions and
// analytical_expression_versions tables that used to belong to the
// standalone analytical-logic-service.
//
// Per ADR-0030 (S8 consolidation): analytical-logic is reusable
// expressions, so this is an internal library, not a separate HTTP
// service. Consumers (today: sql-bi-gateway-service; tomorrow: any
// service that needs to look up or persist a saved expression) embed
// this package and call into AnalyticalExpressionRepo directly. There
// is no standalone HTTP surface — the previous /api/v1/analytical-logic
// routes were retired with the source service.
//
// The schema lives at
// services/sql-bi-gateway-service/migrations/0001_analytical_expressions_foundation.sql,
// applied by the gateway's pre-install Helm Job.
package analyticallogic

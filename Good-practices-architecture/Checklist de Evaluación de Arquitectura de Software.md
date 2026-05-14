# 🏗️ Software Architecture Evaluation Checklist

Evaluate the current project exhaustively, going through each section. For each item, answer with:
- ✅ Meets
- ⚠️ Partially meets (explain what is missing)
- ❌ Does not meet (explain the impact and suggest an improvement)
- 🔘 Not applicable

---

## 1. STRUCTURE AND ORGANIZATION

- [ ] Is there a clear and consistent folder structure?
- [ ] Can you identify which architecture it follows (Clean, Hexagonal, MVC, Vertical Slices, etc.)?
- [ ] Does the structure reflect the business domain and not just the technology? (Screaming Architecture)
- [ ] Do modules/packages have well-defined and bounded responsibilities?
- [ ] Is there a clear separation between business code, infrastructure, and presentation?
- [ ] Is the structure navigable? Could a new developer find something without guidance?
- [ ] Are there "catch-all" files or folders (utils/, helpers/, misc/) with too many responsibilities?

## 2. DEPENDENCIES AND COUPLING

- [ ] Do dependencies flow in a single direction? (from outside in)
- [ ] Does the core/domain depend on external frameworks or libraries?
- [ ] Is dependency inversion (interfaces/ports) used to decouple layers?
- [ ] Could the DB, web framework, or UI be replaced without touching business logic?
- [ ] Does the dependency file (package.json, requirements.txt, etc.) contain unnecessary or outdated dependencies?
- [ ] Are there circular dependencies between modules?
- [ ] Do imports between modules respect the architectural boundaries?

## 3. SOLID PRINCIPLES AND DESIGN

- [ ] **S** — Do classes/modules have a single responsibility?
- [ ] **O** — Can behavior be extended without modifying existing code?
- [ ] **L** — Are implementations substitutable for their abstractions?
- [ ] **I** — Are interfaces small and specific (not "fat" interfaces)?
- [ ] **D** — Do high-level layers depend on abstractions, not on concrete implementations?
- [ ] Is DRY applied without falling into premature abstractions?
- [ ] Is KISS applied? Is there visible over-engineering?
- [ ] Is YAGNI applied? Is there code/abstractions for functionality that does not exist?

## 4. TESTABILITY

- [ ] Is there a test suite? What is its coverage percentage?
- [ ] Are there unit tests for the business/domain logic?
- [ ] Are there integration tests for the outer layers?
- [ ] Are tests independent from each other (they do not share state)?
- [ ] Can the tests be run without relying on external services (DB, APIs)?
- [ ] Can the business logic be tested without complex mocks?
- [ ] Do the tests document the expected behavior of the system?
- [ ] Are there end-to-end tests for the critical flows?

## 5. ERROR HANDLING AND RESILIENCE

- [ ] Is there a consistent error handling strategy?
- [ ] Are custom domain error types used (not just generic exceptions)?
- [ ] Are errors propagated correctly between layers?
- [ ] Is silent error "swallowing" avoided (empty catches)?
- [ ] Is there error handling at the system boundaries (API, DB, files)?
- [ ] Is there retry logic / circuit breaker where appropriate?
- [ ] Are error messages useful for debugging?

## 6. OBSERVABILITY AND DEBUGGING

- [ ] Is there structured and consistent logging?
- [ ] Do logs use appropriate levels (debug, info, warn, error)?
- [ ] Can a complete request/operation be traced through the logs?
- [ ] Are metrics or health checks implemented?
- [ ] Would production errors be easily traceable to their origin?
- [ ] Is logging of sensitive information (passwords, tokens, PII) avoided?

## 7. CONFIGURATION AND ENVIRONMENT

- [ ] Is configuration separated from code (env vars, config files)?
- [ ] Is configuration validated when the application starts?
- [ ] Are secrets kept out of the repository?
- [ ] Are there per-environment configurations (dev, staging, prod)?
- [ ] Is there a .env.example or documentation of required variables?
- [ ] Are there sensible default values for local development?

## 8. SECURITY

- [ ] Does input validation happen at the system boundaries?
- [ ] Is data sanitized before persisting or rendering?
- [ ] Are authentication and authorization centralized?
- [ ] Are the framework's/language's security best practices followed?
- [ ] Is there protection against injections (SQL, XSS, CSRF)?
- [ ] Do endpoints/routes have appropriate access control?
- [ ] Do dependencies have known vulnerabilities?

## 9. PERFORMANCE AND SCALABILITY

- [ ] Are there N+1 queries or inefficient data access patterns?
- [ ] Is caching used where appropriate?
- [ ] Are expensive operations asynchronous where applicable?
- [ ] Are there appropriate indexes in the database?
- [ ] Could the system scale horizontally if needed?
- [ ] Are there obvious bottlenecks (monolithic files, expensive loops)?
- [ ] Are connections to external services handled correctly (pools, timeouts)?

## 10. DOCUMENTATION AND MAINTAINABILITY

- [ ] Is there a README with clear instructions for bringing up the project?
- [ ] Are architectural decisions documented (ADRs)?
- [ ] Is the code self-documenting with clear, expressive names?
- [ ] Do comments explain the "why", not the "what"?
- [ ] Is there API documentation (OpenAPI/Swagger, GraphQL schema)?
- [ ] Is there a contribution guide or coding standards?
- [ ] Would onboarding a new developer be straightforward?

## 11. CI/CD AND CODE QUALITY

- [ ] Is there a CI pipeline that runs tests automatically?
- [ ] Is there a linter/formatter configured and applied consistently?
- [ ] Is there strict type checking (TypeScript strict, mypy, etc.)?
- [ ] Does the code pass all current CI checks?
- [ ] Is there static code analysis (SonarQube, advanced ESLint rules)?
- [ ] Is the deploy process automated and reproducible?

## 12. STATE AND DATA MANAGEMENT

- [ ] Is the data flow predictable and traceable?
- [ ] Is there a clear data access layer (repository pattern, DAL)?
- [ ] Are DB migrations versioned and reversible?
- [ ] Is shared mutable state avoided?
- [ ] Are domain models separated from persistence and API models?
- [ ] Is there data validation in the domain layer (not only in the DB)?

---

## 📊 EXECUTIVE SUMMARY

When finished, produce:

1. **Per-section score** (0-10) and overall score
2. **Top 5 strengths** of the current architecture
3. **Top 5 critical weaknesses** ordered by impact
4. **Identified technical debt** with effort estimate (low/medium/high)
5. **Prioritized action plan** with quick wins and long-term improvements
6. **Recommended architecture** if the current one is not suitable for the use case
7. **Simplified diagram** of the current architecture vs. the ideal one

---

### Instructions for Claude Code:
- Walk through the ENTIRE codebase before answering
- Do not assume; verify each item by reading the code
- Give concrete examples of files/lines when you find problems
- If an item does not apply to the type of project, mark it as 🔘 and explain why
- Be honest and direct: the usefulness of this evaluation depends on its accuracy

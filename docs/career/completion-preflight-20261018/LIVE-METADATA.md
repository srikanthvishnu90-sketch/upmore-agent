# Required metadata before reviewing a live forward upgrade

Run `scripts/career/forward-upgrade/collect-catalog.sql` as the approved database owner in a read-only transaction. Its JSON contains no customer rows, raw function bodies, policy expressions, passwords or connection strings. The compiler's supported baseline is local and deliberately strict; live differences refuse.

- Schema ownership/ACL hashes and global/public/auth default-privilege hashes. Inherited default grants must not bypass source-only private storage assumptions.
- PostgreSQL major version; existence and bypass-RLS flags for `anon`, `authenticated` and `service_role`.
- Each of the twenty-one scoped authority/target tables: existence, kind, owner, RLS flags, ordered columns/types/nullability/default hashes and column ACLs, constraints, index-definition hashes, policies and role names with expression hashes, trigger definitions/enabled flags, ACL grantees/privileges/grant options.
- All overloads of the 101 scoped functions: identity arguments, result type, owner, language, invoker/definer, volatility, parallel/strict flags, full definition and body hashes, configuration/default hashes and execute ACL. Unexpected overloads are differences too.
- Required dependency columns/types/nullability for `auth.users`, `profiles`, `agent_threads`, `agent_flow_state`, `agent_messages` and `agent_usage`. No dependency/customer row is collected.
- Exact source provenance for every different deployed function/trigger/policy, including verified v227 `agent-chat` source and dependency hashes. A hash mismatch cannot be resolved by trusting the older proposal. Review the verified definition in the owner's source system; do not retrieve secrets or export private rows.
- Owner confirmation that workers are fenced and no concurrent schema changes occur during a reviewed migration. Started/reserved effects and unexpired claims require truthful reconciliation; uncertain/completed rows are preserved. No mass reset or fabricated historical admission is permitted.

The package is a narrow forward upgrade from a known original authority baseline. A preexisting partial target schema, existing pair/campaign objects, unknown source attributes, changed grants/policies or installed catalog drift requires an explicit reviewed adaptation and new local upgrade/rollback/rerun contracts. It is not an instruction to drop/recreate objects or normalize live definitions to make a snapshot match.

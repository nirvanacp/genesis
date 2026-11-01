# SDK source activation

- Goal: remove display-frame dependence from hidden source startup and describe failure provenance through compatible types.
- Changes: API-3 source activation skips initialLayout and starts its activation timer after body readiness. Foregrounds retain their visual gate. SourceProblem and SourcePublication add optional failure codes/retryability with host-owned origin.
- Decisions: implemented plan step 1 without changing runtime API, navigation methods or data identities. Source activation is distinct from website content readiness.
- Verification: workspace typecheck passed. A temporary component harness withheld animation frames and delayed body readiness; source activation completed while the foreground waited for its frame. Disposal cleaned both cases. Live device qualification follows the host/applet stages; this harness substitutes runtime dependencies and does not qualify website behavior.

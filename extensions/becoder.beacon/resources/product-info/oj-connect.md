# oj-connect

OJ Connect uses the embedded browser's real website sessions for statements, per-site compiler selection and user-initiated submissions. Users log in and handle required human verification. Ctrl+Alt+S submits the focused supported C/C++ draft, including unsaved edits; a statement-page submission uses that page's associated source.

Supported scope: Luogu problems permitted by the integration; AtCoder supported public statements and ordinary submissions; Codeforces post-contest public ordinary practice (not Gym, ongoing/virtual/group/private/team contests, mirrors or output-only); Nowcoder public ACM stdin/stdout tasks and ended public individually submittable contests (not function-template/PAT/ongoing/private/team/paid tasks); Lanqiao supported public ordinary C/C++ practice. CPH-only imports do not extend these scopes.

Acceptance of a submission and its final verdict are separate. Uncertain acceptance continues verification, never automatic resubmission. Results preserve actual site statuses, units, diagnostics and available case details. The result belongs to the submitted code. Case details may omit their inputs and do not necessarily identify the tested boundaries or data sizes.

A detected submission-source mismatch is displayed on the record page and notified, and that observation is excluded from Beacon's verdict queue. Missing source alone does not discard an otherwise final result.

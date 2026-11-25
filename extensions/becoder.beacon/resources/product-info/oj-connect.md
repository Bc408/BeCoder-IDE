# OJ Connect

OJ Connect provides problem statements, per-OJ compiler selection, user-initiated submissions and feedback for those online submissions across five OJs. It uses real website sessions in BeCoder's embedded browser; users log in on the OJ website. With a supported C/C++ source file focused, Ctrl+Alt+P opens its statement and Ctrl+Alt+S submits the current draft, including unsaved edits. Submitting from a statement page uses that page's associated source and compiler.

Supported scope:
- Luogu: problems supported by the current integration and their permitted access scope. Captchas use the product's image panel.
- AtCoder: public statements and ordinary submissions supported by the integration. Statements initially default to English; Japanese/English can be selected and the preference is remembered. Submission uses a persistent login; required human verification remains the user's responsibility.
- Codeforces: post-contest practice for ordinary public contests on codeforces.com. Gym, ongoing contests, virtual participation, groups, private/team contests, mirrors and output-only tasks are outside scope.
- Nowcoder: public ACM standard-input/output tasks and ended, public, individually submittable contests. Function-template problems, PAT, ongoing/private/team/paid contests and unapproved task types are unsupported.
- Lanqiao: public ordinary C/C++ practice. Specific task types and submission languages remain subject to the current integration and OJ rules.

Each OJ retains separate C and C++ compiler choices. Submission acceptance and the final verdict are different stages. Uncertain acceptance leads to verification, not automatic resubmission. Failure to read a verdict preserves the last real result; querying that submission can continue and does not imply it should be resubmitted. Pages show only status, score, time/memory, compilation information and test points actually provided by the OJ. Missing data is not invented. An earlier AC belongs to its submitted code.

The sidebar's ACM mode hides statement and verdict details without changing submission, querying or CPH testing. CPH imports from additional sources do not establish five-OJ statement or submission support for those sources. Get Problem obtains the problem; Import to CPH imports samples. These are different actions.

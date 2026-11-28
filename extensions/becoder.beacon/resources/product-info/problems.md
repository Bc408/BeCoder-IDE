# problems

The embedded browser's OJ Connect button offers Get Problem and Import to CPH. For supported OJs, Get Problem creates or opens the associated source in an OJ subdirectory and opens its statement; it preserves existing code and unsaved edits and does not initialize CPH. Import to CPH imports samples and associates the same source. The statement's CPH action can also import its samples; replacing existing samples requires confirmation.

Full OJ Connect support covers Luogu, Codeforces, AtCoder, Nowcoder ACM and public Lanqiao practice within each site's supported scope. CPH supports additional imports without extending that scope. Source creation requires an open editor folder; Ctrl+Alt+P opens the identified source's statement.

Successful five-OJ acquisition records which problem was viewed, its associated file and the viewing time. This activity does not contain the statement, prove a solution was completed or permanently bind later runs to the problem.

The statement page always offers zh-CN and en. A missing source language explicitly offers translation; select it to start, with cancellation and the original retained on failure. Configure its model separately in Beacon Settings → Problem translation using existing provider connections. User Get Problem and successful explicit translation populate an application-wide cache of 30 unique problems, independent of activity records. Original changes invalidate dependent translations. fetchProblem requires a language, reads that exact cached version first, then fetches if needed; it never starts translation, updates the cache or lists cached problems.

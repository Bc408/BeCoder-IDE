# OJ parser fixtures

Captured anonymously on 2026-09-20 for parser verification, not redistributed
as product content. Test fixtures are excluded from the extension package.

- `cses-1068.html`: https://cses.fi/problemset/task/1068, HTTP 200, real Weird Algorithm page.
- `hdu-1000.html`: https://acm.hdu.edu.cn/showproblem.php?pid=1000, HTTP 200, real A + B Problem page.
- `acwing-1.html`: reduced login-page marker from https://www.acwing.com/problem/content/1/;
  the anonymous request redirected to login. No login-form tokens are retained.

The inline AcWing, LibreOJ and DMOJ fixtures in parser.test.ts exercise selectors
and sample layouts from Competitive Companion commit
df90fabb52e8f566ea3382405e22d246af5d6a69. They are synthetic DOM-contract fixtures.
DMOJ https://dmoj.ca/problem/aplusb returned 403; https://loj.ac/p/1 returned an
application shell without rendered problem data. No authenticated sessions were used.

All HTML fixtures are parsed through JSDOM with scripts disabled and resource
loading disabled. Browser-rendered site compatibility remains separate from these tests.

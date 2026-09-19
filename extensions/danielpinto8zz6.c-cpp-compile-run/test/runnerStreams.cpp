#if defined(BECODER_SOURCE_DEBUGGER)
#include "../../../resources/oi-defaults/toolchains/becoder-debugger.h"
#endif
#include<bits/stdc++.h>
using namespace std;
int main(int argc,char**) {
  if (argc>1) cin.tie(0)->sync_with_stdio(0);
  for (int i=0;i<5;i++) {
    cout<<"OUT"<<i<<'\n';
    debug(i);
  }
  return 0;
}

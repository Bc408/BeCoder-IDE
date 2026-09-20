#include<bits/stdc++.h>
using namespace std;
int main() {
  cin.tie(0)->sync_with_stdio(0);
  int n;
  if (!(cin>>n)) {
    cout<<"EOF\n";
    return 0;
  }
  cerr<<"debug:"<<n<<'\n';
  cout<<n*2<<'\n';
  if (n==125) return 125;
  if (n==-1) for (;;) {}
  return 0;
}

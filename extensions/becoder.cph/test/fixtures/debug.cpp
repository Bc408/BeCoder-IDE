#include<bits/stdc++.h>
using namespace std;
int main() {
  cin.tie(0)->sync_with_stdio(0);
  vector<int> a={1,2};
  map<string,vector<int>> m={{"容器",a}};
  tuple<int,string> t=make_tuple(7,"测试");
  tuple<> empty;
  __int128 large=(__int128)1<<100;
  debug(a);
  debug(m);
  debug(t);
  debug(empty);
  debug(large);
  thread worker([] {});
  worker.join();
  try {
    throw runtime_error("异常");
  } catch (const exception &e) {
    debug(e.what());
  }
  cout<<"中文 stdout"<<'\n';
  return 0;
}

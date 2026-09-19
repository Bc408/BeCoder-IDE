/* Copyright (c) 2026 BeCoder contributors. GPL-3.0-or-later. */
#include<bits/stdc++.h>
#define WIN32_LEAN_AND_MEAN
#include<windows.h>
#include<io.h>
#include<fcntl.h>
using namespace std;
int main(int argc,char**) {
  if (argc>1) for (;;) Sleep(100);
  _setmode(_fileno(stdin),_O_BINARY);
  cin.tie(0)->sync_with_stdio(0);
  int c=cin.get();
  if (c=='E') return 7;
  if (c=='R') return 125;
  if (c=='S') for (;;) Sleep(100);
  if (c=='D') {
    wchar_t self[32768];
    GetModuleFileNameW(nullptr,self,32768);
    wstring command=L"\""+wstring(self)+L"\" --child";
    STARTUPINFOW si{};
    si.cb=sizeof(si);
    PROCESS_INFORMATION pi{};
    if (!CreateProcessW(self,command.data(),nullptr,nullptr,FALSE,0,nullptr,nullptr,&si,&pi)) return 9;
    cout<<"CHILD="<<pi.dwProcessId<<'\n'<<flush;
    CloseHandle(pi.hThread);
    CloseHandle(pi.hProcess);
    for (;;) Sleep(100);
  }
  uint64_t sum=0,cnt=0;
  for (;c!=EOF;c=cin.get()) sum+=c,cnt++;
  cout<<"COUNT="<<cnt<<",SUM="<<sum<<'\n';
  cerr<<"\033[35mDEBUG="<<cnt<<"\033[0m\n";
  cout<<"PIPE="<<(GetFileType(GetStdHandle(STD_INPUT_HANDLE))==FILE_TYPE_PIPE)<<'\n';
  cerr<<"CONSOLE="<<(_isatty(_fileno(stdout)) && _isatty(_fileno(stderr)))<<'\n';
  cout<<"DONE\n";
  return 0;
}

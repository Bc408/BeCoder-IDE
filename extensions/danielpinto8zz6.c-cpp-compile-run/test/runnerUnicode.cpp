/* Copyright (c) 2026 BeCoder contributors. GPL-3.0-or-later. */
#include<bits/stdc++.h>
#define WIN32_LEAN_AND_MEAN
#include<windows.h>
#include<conio.h>
#include<io.h>
using namespace std;
int main() {
  cin.tie(0)->sync_with_stdio(0);
  string name;
  cout<<"CP="<<GetConsoleOutputCP()<<",IN="<<GetConsoleCP()<<'\n';
  cout<<"学生成绩管理系统\n姓名："<<flush;
  if (!(cin>>name) || name!="张三") return 3;
  cout<<"\nINPUT_OK="<<name<<'\n';
  if (_isatty(0)) {
    cout<<"KEY_READY\n"<<flush;
    if (getch()!='x') return 4;
  }
  for (int i=0;i<3;i++) {
    system("cls");
    cout<<"学生成绩管理系统 "<<i<<"\n请选择："<<flush;
    Sleep(30);
  }
}

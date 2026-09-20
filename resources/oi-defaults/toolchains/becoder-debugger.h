#ifdef DEBUG
#ifndef DEBUGER_H
#define DEBUGER_H
#include <algorithm>
#include <array>
#include <deque>
#include <iostream>
#include <functional>
#include <type_traits>
#include <list>
#include <map>
#include <queue>
#include <set>
#include <sstream>
#include <stack>
#include <string>
#include <tuple>
#include <unordered_map>
#include <unordered_set>
#include <vector>
using namespace std;

#define COLOR_START "\033[35m"
#define COLOR_END "\033[0m"

// 辅助内容
// [begin, begin + 1, ... end]
template <typename T>
struct is_array_t : false_type {};
template <typename T>
struct is_array_t<vector<T>> : true_type {};
template <typename T>
struct is_array_t<deque<T>> : true_type {};
template <typename T, size_t N>
struct is_array_t<array<T, N>> : true_type {};

// [0, 1, 2 ...]
template <typename T>
struct is_normal_array_t : false_type {};
template <typename T, size_t N>
struct is_normal_array_t<T[N]> : true_type {};
template <typename T, size_t N>
constexpr size_t array_size(const T (&)[N]) {
  return N;
}

// elm1 -> elm2 -> elm3
template <typename T>
struct is_list_t : false_type {};
template <typename T>
struct is_list_t<list<T>> : true_type {};

// [front1, front2, front3, ...]
template <typename T>
struct is_queue_t : false_type {};
template <typename T>
struct is_queue_t<queue<T>> : true_type {};

// [..., top3, top2, top1]
template <typename T>
struct is_stack_t : false_type {};
template <typename T>
struct is_stack_t<stack<T>> : true_type {};

// [top1, top2, top3, ...]
template <typename T>
struct is_priority_queue_t : false_type {};
template <typename T, typename Container, typename Compare>
struct is_priority_queue_t<priority_queue<T, Container, Compare>> : true_type {
};

// {k1, k2, k3}
template <typename T>
struct is_set_t : false_type {};
template <typename T>
struct is_set_t<set<T>> : true_type {};
template <typename T>
struct is_set_t<multiset<T>> : true_type {};
template <typename T>
struct is_set_t<unordered_set<T>> : true_type {};
template <typename T>
struct is_set_t<unordered_multiset<T>> : true_type {};

// {
//   k: v,
// }
template <typename T>
struct is_map_t : false_type {};
template <typename T, typename S>
struct is_map_t<map<T, S>> : true_type {};
template <typename T, typename S>
struct is_map_t<multimap<T, S>> : true_type {};
template <typename T, typename S>
struct is_map_t<unordered_map<T, S>> : true_type {};
template <typename T, typename S>
struct is_map_t<unordered_multimap<T, S>> : true_type {};

// <first, second>
template <typename T>
struct is_pair_t : false_type {};
template <typename T1, typename T2>
struct is_pair_t<pair<T1, T2>> : true_type {};

// <0, 1, 2, 3>
template <typename T>
struct is_tuple_t : false_type {};
template <typename... Args>
struct is_tuple_t<tuple<Args...>> : true_type {};

// string
template <typename T>
struct is_string_t : false_type {};
template <>
struct is_string_t<string> : true_type {};
template <>
struct is_string_t<const char*> : true_type {};
template <>
struct is_string_t<char*> : true_type {};
template <size_t N>
struct is_string_t<char[N]> : true_type {};

class __Debugger {
  // 私有成员对象
  stringstream ss;
  // 私有成员函数
  template<size_t I=0,typename... Args>
  typename enable_if<I==sizeof...(Args)>::type output_tuple_items(const tuple<Args...>&) {}
  template<size_t I=0,typename... Args>
  typename enable_if<I<sizeof...(Args)>::type output_tuple_items(const tuple<Args...>& t) {
    ss<<(I==0? "":", ");
    output(get<I>(t));
    output_tuple_items<I+1>(t);
  }
  template<typename... Args>
  void output_tuple(const tuple<Args...>& t) {
    ss<<"<";
    output_tuple_items(t);
    ss<<">";
  }

  template <typename T, typename S>
  void output_pair(const pair<T, S>& p) {
    ss << "<";
    output(p.first);
    ss << ", ";
    output(p.second);
    ss << ">";
  }

  template <typename T>
  void output_array(const T& arr, size_t n) {
    ss << "[";
    for (size_t i = 0; i < n; ++i) {
      output(arr[i]);
      ss << (i == n - 1 ? "" : ", ");
    }
    ss << "]";
  }

  template <typename T>
  void output_queue(const queue<T>& q) {
    ss << "QUE[";
    auto temp = q;
    while (!temp.empty()) {
      output(temp.front());
      temp.pop();
      ss << (temp.empty() ? "" : ", ");
    }
    ss << "]";
  }

  template <typename T>
  void output_stack(const stack<T>& s) {
    auto temp = s;
    vector<T> vec;
    while (!temp.empty()) {
      vec.push_back(temp.top());
      temp.pop();
    }
    reverse(vec.begin(), vec.end());
    ss << "STK";
    output(vec);
  }

  template <typename T>
  void output_priority_queue(const T& pq) {
    ss << "PQ[";
    auto temp = pq;
    while (!temp.empty()) {
      output(temp.top());
      temp.pop();
      ss << (temp.empty() ? "" : ", ");
    }
    ss << "]";
  }

  template <typename T>
  void output_set(const T& s) {
    ss << "{";
    bool first = true;
    for (const auto& val : s) {
      if (!first) ss << ", ";
      first = false;
      output(val);
    }
    ss << "}";
  }

  template <typename T>
  void output_map(const T& m) {
    ss << "{";
    bool first = true;
    for (const auto &item:m) {
      if (!first) ss << ", ";
      first = false;
      output(item.first);
      ss << ": ";
      output(item.second);
    }
    ss << "}";
  }

  template <typename T>
  void output_list(const T& l) {
    bool first = true;
    for (const auto& val : l) {
      if (!first) ss << " --> ";
      first = false;
      output(val);
    }
  }

  void output_int128(__int128 val) {
    bool negative=val<0;
    unsigned __int128 magnitude=negative?(unsigned __int128)(-(val+1))+1:(unsigned __int128)val;
    string digits;
    do {
      digits.push_back(char('0'+magnitude%10));
      magnitude/=10;
    } while (magnitude!=0);
    if (negative) digits.push_back('-');
    reverse(digits.begin(),digits.end());
    ss<<digits;
  }

  void output_uint128(unsigned __int128 val) {
    string digits;
    do {
      digits.push_back(char('0'+val%10));
      val/=10;
    } while (val!=0);
    reverse(digits.begin(),digits.end());
    ss<<digits;
  }

  //标签分派兼容 C++11，同时保留各类容器的输出格式。
  template<typename T>
  void output(const T& val) {
    typedef integral_constant<int,is_same<typename remove_cv<T>::type,__int128>::value? 1:is_same<typename remove_cv<T>::type,unsigned __int128>::value? 2:is_fundamental<T>::value? 3:is_string_t<T>::value? 4:is_array_t<T>::value? 5:is_normal_array_t<T>::value? 6:is_queue_t<T>::value? 7:is_stack_t<T>::value? 8:is_priority_queue_t<T>::value? 9:is_list_t<T>::value? 10:is_set_t<T>::value? 11:is_map_t<T>::value? 12:is_pair_t<T>::value? 13:is_tuple_t<T>::value? 14:0> tag;
    output_value(val,tag());
  }
  template<typename T>
  void output_value(const T& val,integral_constant<int,1>) { output_int128(val); }
  template<typename T>
  void output_value(const T& val,integral_constant<int,2>) { output_uint128(val); }
  template<typename T>
  void output_value(const T& val,integral_constant<int,3>) { ss<<val; }
  template<typename T>
  void output_value(const T& val,integral_constant<int,4>) { ss<<"\""<<val<<"\""; }
  template<typename T>
  void output_value(const T& val,integral_constant<int,5>) { output_array(val,val.size()); }
  template<typename T>
  void output_value(const T& val,integral_constant<int,6>) { output_array(val,array_size(val)); }
  template<typename T>
  void output_value(const T& val,integral_constant<int,7>) { output_queue(val); }
  template<typename T>
  void output_value(const T& val,integral_constant<int,8>) { output_stack(val); }
  template<typename T>
  void output_value(const T& val,integral_constant<int,9>) { output_priority_queue(val); }
  template<typename T>
  void output_value(const T& val,integral_constant<int,10>) { output_list(val); }
  template<typename T>
  void output_value(const T& val,integral_constant<int,11>) { output_set(val); }
  template<typename T>
  void output_value(const T& val,integral_constant<int,12>) { output_map(val); }
  template<typename T>
  void output_value(const T& val,integral_constant<int,13>) { output_pair(val); }
  template<typename T>
  void output_value(const T& val,integral_constant<int,14>) { output_tuple(val); }
  template<typename T>
  void output_value(const T&,integral_constant<int,0>) { ss<<"unknown type"; }
  void print() {
    string str = ss.str();
    auto has_newline_child = [&](size_t i) {
      int cnt = 0;
      for (; i < str.size(); ++i) {
        if (str[i] == '{' || str[i] == '[') {
          cnt++;
          if (cnt == 2) return true;
        }
        if (str[i] == ':') {
          if (cnt == 1) return true;
        }
        if (str[i] == '}' || str[i] == ']') {
          cnt--;
          if (cnt == 0) return false;
        }
      }
      return false;
    };
    int level = 0;
    function<void(size_t&,bool)> dfs = [&](size_t& i,bool need_newline) {
      int cnt = 0;
      for (; i < str.size(); ++i) {
        if (str[i] == '<' || str[i] == '[' || str[i] == '{') cnt++;
        if (str[i] == '>' || str[i] == ']' || str[i] == '}') cnt--;
        if (str[i] == '[' || str[i] == '{') {
          bool next_need_newline = has_newline_child(i);
          level++;
          if (next_need_newline) {
            cerr << str[i] << "\n" << string(level * 2, ' ');
          } else {
            cerr << str[i];
          }
          dfs(++i,next_need_newline);
          cnt--;
        } else if (str[i] == ']' || str[i] == '}') {
          level--;
          if (need_newline) {
            cerr << "\n" << string(level * 2, ' ') << str[i];
          } else {
            cerr << str[i];
          }
          return;
        } else if (str[i] == ',' && cnt == 0 && need_newline) {
          ++i;
          cerr << ",\n" << string(level * 2, ' ');
        } else {
          cerr << str[i];
        }
      }
    };
    size_t i = 0;
    dfs(i,false);
  }

 public:
  __Debugger() { ss << boolalpha; }

  // 对外只有两个方法
  template <typename T>
  __Debugger& operator<<(const T& val) {
    output(val);
    cerr << COLOR_START;
    print();
    cerr << COLOR_END << '\n';
    ss.str("");
    return *this;
  }
  void sp(const string& str = "") {
    cerr << COLOR_START << "====================" << str
         << "====================" << COLOR_END << '\n';
  }
} dout;
#define debug(x) cerr << COLOR_START << #x << ": " << COLOR_END, dout << x

#endif  // DEBUGER_H
#endif  // DEBUG

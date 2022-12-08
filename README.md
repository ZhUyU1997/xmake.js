# xmake.js
Chat GPT将xmake.sh (https://github.com/xmake-io/xmake.sh/blob/master/configure) 翻译为js代码

## 使用下面的描述文字翻译，由于输出限制，需要重复分段输入
```
将下面的bash代码翻译成ES6 JS代码， 运行环境为node.js，不修改变量名， 并且highlight：
#!/bin/sh
# A script-only build utility like autotools
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http:##www.apache.org#licenses#LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
#
# Copyright (C) 2022-present, TBOOX Open Source Group.
#
# @author      ruki
#

#-----------------------------------------------------------------------------
# some constants
#
xmake_sh_projectdir=$(X= cd -- "$(dirname -- "$0")" && pwd -P)
xmake_sh_buildir="build"
xmake_sh_version="1.0.2"
xmake_sh_verbose=false
xmake_sh_diagnosis=false
xmake_sh_copyright="Copyright (C) 2022-present Ruki Wang, tboox.org, xmake.io."

#-----------------------------------------------------------------------------
# some helper functions
#
raise() {
    echo "$@" 1>&2 ; exit 1
}

vprint() {
    if "${xmake_sh_verbose}"; then
        echo "$@"
    fi
}

dprint() {
    if "${xmake_sh_diagnosis}"; then
        echo "$@"
    fi
}

# show and escape string instead of `echo -e`, because sh does not support it
print() {
    printf "${@}\n"
}

# test empty string
_test_z() {
    if test "x${1}" = "x"; then
        return 0
    fi
    return 1
}

# test non-empty string
_test_nz() {
    if test "x${1}" != "x"; then
        return 0
    fi
    return 1
}

# test string is equal
_test_eq() {
    if test "x${1}" = "x${2}"; then
        return 0
    fi
    return 1
}

# test string is not equal
_test_nq() {
    if test "x${1}" != "x${2}"; then
        return 0
    fi
    return 1
}

string_toupper() {
    echo "$1" | tr '[a-z]' '[A-Z]'
}

string_tolower() {
    echo "$1" | tr '[A-Z]' '[a-z]'
}

string_replace() {
    echo "$1" | sed "s/${2}/${3}/g"
}

string_split() {
    local str="${1}"
    local sep="${2}"
    local idx="${3}"
    cut -d "${sep}" -f ${idx} <<< "${str}"
}

```

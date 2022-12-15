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
test_z() {
    if test "x${1}" = "x"; then
        return 0
    fi
    return 1
}

# test non-empty string
test_nz() {
    if test "x${1}" != "x"; then
        return 0
    fi
    return 1
}

# test string is equal
test_eq() {
    if test "x${1}" = "x${2}"; then
        return 0
    fi
    return 1
}

# test string is not equal
test_nq() {
    if test "x${1}" != "x${2}"; then
        return 0
    fi
    return 1
}

string_toupper() {
    _ret=$(echo "$1" | tr '[a-z]' '[A-Z]')
}

string_tolower() {
    _ret=$(echo "$1" | tr '[A-Z]' '[a-z]')
}

string_replace() {
    _ret=$(echo "$1" | sed "s/${2}/${3}/g")
}

# we avoid use `cut` command, because it's slow
string_split() {
    local str="${1}"
    local sep="${2}"
    local idx="${3}"
    local oldifs="${IFS}"
    IFS="${sep}"
    set -- ${str}
    if test_nz "${idx}"; then
        case "${idx}" in
            1) _ret="$1";;
            2) _ret="$2";;
            3) _ret="$3";;
        esac
    else
        _ret="$1"
        _ret2="$2"
        _ret3="$3"
    fi
    IFS="${oldifs}"
}

# does contain sub-string?
# e.g.
# str="src/*.cpp"
# string_contains "$str" "src"
string_contains() {
    case "${1}" in
        *${2}*) return 0;;
        *) return 1;;
    esac
    return 1
}

# does contain "*"?
string_contains_star() {
    case "${1}" in
        *\**) return 0;; # bash
        *'*'*) return 0;; # csh
        *) return 1;;
    esac
    return 1
}

# does contain "**"?
string_contains_star2() {
    case "${1}" in
        *\*\**) return 0;; # bash
        *'**'*) return 0;; # csh
        *) return 1;;
    esac
    return 1
}

# does startswith sub-string?
# e.g.
# str="src/*.cpp"
# string_startswith "$str" "src"
string_startswith() {
    case "${1}" in
        ${2}*) return 0;;
        *) return 1;;
    esac
    return 1
}

# duplicate characters
# e.g. string_dupch 10 "." => ...........
string_dupch() {
    local count=${1}
    local ch=${2}
    printf %${count}s | tr " " "${ch}"
}

# replace file content
_io_replace_file() {
    local infile="${1}"
    local outfile="${2}"
    local patterns="${3}"
    sed "/./ {${patterns}}" "${infile}" > "${outfile}"
}

# try remove file or directory
_os_tryrm() {
    if test -f "${1}"; then
        rm "${1}"
    elif test -d "${1}"; then
        rm -r "${1}"
    fi
}

# get temporary file
_os_tmpfile() {
    _ret=$(mktemp)
}

# try run program
_os_runv() {
    local cmd="${@}"
    if ${xmake_sh_diagnosis}; then
        ${cmd}
    else
        ${cmd} >/dev/null 2>&1
    fi
    local ok=$?
    if test "${ok}" -ne "0"; then
        return 1
    fi
    return 0
}

# try run program and get output
_os_iorunv() {
    local cmd="${@}"
    _os_tmpfile
    local tmpfile="${_ret}"
    ${cmd} >"${tmpfile}" 2>&1
    local ok=$?
    if test "${ok}" -ne "0"; then
        _ret=""
    else
        local result=$(cat "${tmpfile}")
        _ret="${result}"
    fi
    _os_tryrm "${tmpfile}"
}

# find file in the given directory
# e.g. _os_find . xmake.sh
_os_find() {
    local dir="${1}"
    local name="${2}"
    local depth="${3}"
    if test_nz "${depth}"; then
        if is_host "macosx"; then
            _ret=$(find "${dir}" -depth "${depth}" -name "${name}")
        else
            _ret=$(find "${dir}" -maxdepth "${depth}" -mindepth "${depth}" -name "${name}")
        fi
    else
        _ret=$(find "${dir}" -name "${name}")
    fi
}

# get date, "%Y%m%d%H%M" -> 202212072222
_os_date() {
    _ret=$(date +"${1}")
}

# we avoid use `basename`, because it's slow
path_filename() {
    local path="${1}"
    local oldifs="${IFS}"
    IFS='/'
    set -- ${path}
    local filename=""
    for item in $@; do
        filename="$item"
    done
    _ret="${filename}"
    IFS="${oldifs}"
}

path_extension() {
    path_filename "${1}"; local filename="${_ret}"
    _ret=".${filename##*.}"
}

path_basename() {
    path_filename "${1}"; local filename="${_ret}"
    _ret="${filename%.*}"
}

# we avoid use `dirname -- ${1}`, because it's too slow
path_directory() {
    local path="${1}"
    local oldifs="${IFS}"
    IFS='/'
    set -- ${path}
    local dir=""
    local first=true
    local startswith_sep=false
    while test $# != 1; do
        local item="${1}"
        if test_nz "${item}"; then
            dir="${dir}/${item}"
        elif $first; then
            startswith_sep=true
        fi
        first=false
        shift
    done
    if $startswith_sep; then
        if test_z "${dir}"; then
            dir="/"
        fi
    else
        dir="${dir#/}"
        if test_z "${dir}"; then
            dir="."
        fi
    fi
    _ret="${dir}"
    IFS="${oldifs}"
}

# e.g. path_filename_fromdir "/tmp/file" "/tmp" -> "file"
path_filename_fromdir() {
    _ret="${1#${2}/}"
}

path_is_absolute() {
    if string_startswith "${1}" "/"; then
        return 0
    fi
    return 1
}

# get relative path, e.g $(path_relative ${rootdir} ${absolute_path}`
path_relative() {
    local source=$1
    local target=$2

    local common_part=$source
    local result=""

    while test_eq "${target#$common_part}" "${target}"; do
        # no match, means that candidate common part is not correct
        # go up one level (reduce common part)
        path_directory "${common_part}"; common_part="${_ret}"
        # and record that we went back, with correct / handling
        if test_z $result; then
            result=".."
        else
            result="../$result"
        fi
    done

    if test_eq $common_part "/"; then
        # special case for root (no common path)
        result="$result/"
    fi

    # since we now have identified the common part,
    # compute the non-common part
    local forward_part="${target#$common_part}"

    # and now stick all parts together
    if test_nz $result && test_nz $forward_part; then
        result="$result$forward_part"
    elif test_nz $forward_part; then
        # remote extra '/', e.g. "/xxx" => "xxx"
        result="${forward_part#*/}"
    fi

    _ret="$result"
}

path_sourcekind() {
    local sourcekind=""
    case "${1}" in
        *.cpp) sourcekind="cxx";;
        *.cc) sourcekind="cxx";;
        *.c) sourcekind="cc";;
        *.ixx) sourcekind="cxx";;
        *.mm) sourcekind="mxx";;
        *.m) sourcekind="mm";;
        *.S) sourcekind="as";;
        *.s) sourcekind="as";;
        *.asm) sourcekind="as";;
        *) raise "unknown sourcekind for ${1}" ;;
    esac
    _ret="${sourcekind}"
}

path_toolname() {
    local toolname=""
    case "${1}" in
        *-gcc) toolname="gcc";;
        */gcc) toolname="gcc";;
        gcc) toolname="gcc";;
        *-g++) toolname="gxx";;
        */g++) toolname="gxx";;
        g++) toolname="gxx";;
        xcrun*clang++) toolname="clangxx";;
        xcrun*clang) toolname="clang";;
        *-clang++) toolname="clangxx";;
        */clang++) toolname="clangxx";;
        clang++) toolname="clangxx";;
        *-clang) toolname="clang";;
        */clang) toolname="clang";;
        clang) toolname="clang";;
        *-ar) toolname="ar";;
        */ar) toolname="ar";;
        ar) toolname="ar";;
        *) raise "unknown tool ${1}";;
    esac
    _ret="${toolname}"
}

# get flag name from toolkind, e.g. cc => cflags, cxx => cxxflags
_get_flagname() {
    local toolkind="${1}"
    local flagname=""
    case "${toolkind}" in
        cc) flagname="cflags";;
        cxx) flagname="cxxflags";;
        as) flagname="asflags";;
        mm) flagname="mflags";;
        mxx) flagname="mxxflags";;
        ar) flagname="arflags";;
        sh) flagname="shflags";;
        ld) flagname="ldflags";;
        *) raise "unknown toolkind(${toolkind})!" ;;
    esac
    _ret="${flagname}"
}

# is enabled? true, yes, y
_is_enabled() {
    local value=${1}
    if test_eq "${value}" "true"; then
        return 0
    elif test_eq "${value}" "yes"; then
        return 0
    elif test_eq "${value}" "y"; then
        return 0
    fi
    return 1
}

# deduplicate string list
# .e.g "hello world hello how are you world" -> hello world how are you
_dedup() {
    _ret=$(echo "${1}" | awk '{for (i = 1; i <= NF; ++i) if (!seen[$i]++) printf $i " "}')
}

# deduplicate string list from the reverse order
# .e.g "hello world hello how are you world" -> hello how are you world
_dedup_reverse() {
    local result=""
    local list=$(echo "${1}" | awk '{for (i = NF; i > 0; --i) if (!seen[$i]++) printf $i " "}')
    local item=""
    for item in ${list}; do
        result="${item} ${result}"
    done
    _ret="${result}"
}

#-----------------------------------------------------------------------------
# map functions
#

# define map, @note we can not use bash/declare to define map, because sh does not support it.
#
# _map "options"
# _map_set "options" "key1" "value1"
# _map_set "options" "key2" "value2"
# _map_set "options" "key2" "value3"
# _map_set "options" "key3" "value3"
# _map_set "options" "key4" "__empty__"
# _map_set "options" "key4" "__empty__"
# _map_count "options"; _count="${_ret}"
# _map_keys "options"; _keys="${_ret}"
# echo ${_count}
# for key in ${_keys}; do
#     _map_get "options" ${key}; value="{_ret}"
#     echo ${key} "->" ${value}
# done
#
# echo "------"
# _map_remove "options" "key3"
# _map_count "options"; _count="${_ret}"
# _map_keys "options"; _keys="${_ret}"
# echo ${_count}
# for key in ${_keys}; do
#     _map_get "options" ${key}; value="{_ret}"
#     echo ${key} "->" ${value}
# done
#
_map() {
    local name=${1}
#    eval _map_${name}_count=0
#    eval _map_${name}_keys=""
}

# because the shell is slow, we have to temporarily
# disable some of the map features for performance.
#
#_map_count() {
#    local name=${1}
#    local count=$(eval echo \$_map_${name}_count)
#    _ret="${count}"
#}

_map_get() {
    local name=${1}
    local key=${2}
    local value=$(eval echo \$_map_${name}_value_${key})
    if test_eq "${value}" "__empty__"; then
        value=""
    fi
    _ret="${value}"
}

_map_has() {
    local name=${1}
    local key=${2}
    local value=$(eval echo \$_map_${name}_value_${key})
    if test_nz "${value}"; then
        return 0
    fi
    return 1
}

_map_set() {
    local name=${1}
    local key=${2}
    local value=${3}
#    if ! _map_has ${name} ${key}; then
#        _map_count "options"; local count="${_ret}"
#        eval _map_${name}_count=$((${count} + 1))
#        local keys=$(eval echo \$_map_${name}_keys)
#        keys="${keys} ${key}"
#        eval _map_${name}_keys=\${keys}
#    fi
    eval _map_${name}_value_${key}=\${value}
}

#_map_remove() {
#    local name=${1}
#    local key=${2}
#    if _map_has ${name} ${key}; then
#        _map_count "options"; local count="${_ret}"
#        eval _map_${name}_count=$((${count} - 1))
#        eval _map_${name}_value_${key}=""
#        local keys=$(eval echo \$_map_${name}_keys)
#        local keys_new=""
#        local k=""
#        for k in ${keys}; do
#            if test_nq "${k}" "${key}"; then
#                keys_new="${keys_new} ${k}"
#            fi
#        done
#        eval _map_${name}_keys=\${keys_new}
#    fi
#}

#_map_keys() {
#    local name=${1}
#    local keys=$(eval echo \$_map_${name}_keys)
#    _ret="${keys}"
#}

#-----------------------------------------------------------------------------
# detect default environments
#

# detect hosts
os_host=`uname`
string_tolower ${os_host}; os_host="${_ret}"
if echo "${os_host}" | grep cygwin >/dev/null 2>&1; then
    os_host="cygwin"
fi
if echo "${os_host}" | grep msys >/dev/null 2>&1; then
    os_host="msys"
fi
if echo "${os_host}" | grep mingw >/dev/null 2>&1; then
    os_host="msys"
fi
if echo "${os_host}" | grep darwin >/dev/null 2>&1; then
    os_host="macosx"
fi
if echo "${os_host}" | grep linux >/dev/null 2>&1; then
    os_host="linux"
fi
if echo "${os_host}" | grep freebsd >/dev/null 2>&1; then
    os_host="freebsd"
fi
if echo "${os_host}" | grep bsd >/dev/null 2>&1; then
    os_host="bsd"
fi

# determining host
# e.g.
# if is_host "linux" "macosx"; then
#     ...
# fi
is_host() {
    local host=""
    for host in $@; do
        if test_eq "${os_host}" "${host}"; then
            return 0
        fi
    done
    return 1
}

# detect host architecture
os_arch=`uname -m | tr '[A-Z]' '[a-z]'`

# set the default target platform and architecture
_target_plat_default=${os_host}
if is_host "msys"; then
    _target_plat_default="mingw"
fi
_target_arch_default=${os_arch}
_target_mode_default="release"

# set the default project generator and build program
if is_host "freebsd" "bsd"; then
    _project_generator="gmake"
    _make_program_default="gmake"
    _ninja_program_default="ninja"
elif is_host "msys" "cygwin"; then
    _project_generator="gmake"
    _make_program_default="make.exe"
    _ninja_program_default="ninja.exe"
else
    _project_generator="gmake"
    _make_program_default="make"
    _ninja_program_default="ninja"
fi

# set the default directories
if test -d "/usr/local"; then
    _install_prefix_default="/usr/local"
elif test -d "/usr"; then
    _install_prefix_default="/usr"
fi
_install_bindir_default="bin"
_install_libdir_default="lib"
_install_includedir_default="include"

# determining target platform
# e.g.
# if is_plat "linux" "macosx"; then
#     ...
# fi
is_plat() {
    local plat=""
    for plat in $@; do
        if test_eq "${_target_plat}" "${plat}"; then
            return 0
        fi
    done
    return 1
}

# determining target architecture
# e.g.
# if is_arch "x86_64" "i386"; then
#     ...
# fi
is_arch() {
    local arch=""
    for arch in $@; do
        if test_eq "${_target_arch}" "${arch}"; then
            return 0
        fi
    done
    return 1
}

# determining target mode
# e.g.
# if is_mode "release"; then
#     ...
# fi
is_mode() {
    local mode=""
    for mode in $@; do
        if test_eq "${_target_mode}" "${mode}"; then
            return 0
        fi
    done
    return 1
}

# determining target toolchain
# e.g.
# if is_toolchain "clang"; then
#     ...
# fi
is_toolchain() {
    local toolchain=""
    for toolchain in $@; do
        if test_eq "${_target_toolchain}" "${toolchain}"; then
            return 0
        fi
    done
    return 1
}

#-----------------------------------------------------------------------------
# project configuration apis
#

# set project name
set_project() {
    _xmake_sh_project_name="${1}"
}

# include the given xmake.sh file or directory
# e.g. includes "src" "tests"
includes() {
    local path=""
    for path in $@; do
        if test -f "${path}"; then
            path_directory "${path}"; xmake_sh_scriptdir="${_ret}"
            . "${path}"
        else
            local xmake_sh_scriptdir_cur=${xmake_sh_scriptdir}
            if test "x${xmake_sh_scriptdir}" != "x"; then
                xmake_sh_scriptdir="${xmake_sh_scriptdir_cur}/${path}"
                . "${xmake_sh_scriptdir}/xmake.sh"
            else
                . "${xmake_sh_projectdir}/${path}/xmake.sh"
            fi
            xmake_sh_scriptdir=${xmake_sh_scriptdir_cur}
        fi
    done
}

#-----------------------------------------------------------------------------
# some helper functions
#

# split flags
_split_flags() {
    string_replace "${1}" ":" " "
}

# get abstract flag for gcc/clang
_get_abstract_flag_for_gcc_clang() {
    local toolkind="${1}"
    local toolname="${2}"
    local itemname="${3}"
    local value="${4}"
    local flag=""
    case "${itemname}" in
        defines)
            string_replace "${value}" '"' '\\\"'; value="${_ret}"
            flag="-D${value}"
            ;;
        udefines) flag="-U${value}";;
        includedirs) flag="-I${value}";;
        linkdirs) flag="-L${value}";;
        links) flag="-l${value}";;
        syslinks) flag="-l${value}";;
        frameworks) flag="-framework ${value}";;
        frameworkdirs) flag="-F${value}";;
        rpathdirs)
            if test_eq "${toolname}" "gcc" || test_eq "${toolname}" "gxx"; then
                # escape $ORIGIN in makefile, TODO we need also handle it for ninja
                string_replace "${value}" "@loader_path" '$$ORIGIN'; value="${_ret}"
                flag="-Wl,-rpath='${value}'"
            elif test_eq "${toolname}" "clang" || test_eq "${toolname}" "clangxx"; then
                string_replace "${value}" "\$ORIGIN" "@loader_path"; value="${_ret}"
                flag="-Xlinker -rpath -Xlinker ${value}"
            fi
            ;;
        symbols)
            if test_eq "${value}" "debug"; then
                flag="-g"
            elif test_eq "${value}" "hidden"; then
                flag="-fvisibility=hidden"
            fi
            ;;
        strip)
            if test_eq "${value}" "debug"; then
                flag="-Wl,-S"
            elif test_eq "${value}" "all"; then
                if is_plat "macosx"; then
                    flag="-Wl,-x"
                else
                    flag="-s"
                fi
            fi
            ;;
        warnings)
            if test_eq "${value}" "all" || test_eq "${value}" "more" || test_eq "${value}" "less"; then
                flag="-Wall"
            elif test_eq "${value}" "allextra"; then
                flag="-Wall -Wextra"
            elif test_eq "${value}" "error"; then
                flag="-Werror"
            elif test_eq "${value}" "everything"; then
                flag="-Wall -Wextra"
            elif test_eq "${value}" "none"; then
                flag="-w"
            fi
            ;;
        optimizes)
            if test_eq "${value}" "fast"; then
                flag="-O1"
            elif test_eq "${value}" "faster"; then
                flag="-O2"
            elif test_eq "${value}" "fastest"; then
                flag="-O3"
            elif test_eq "${value}" "smallest"; then
                if test_eq "${toolname}" "clang" || test_eq "${toolname}" "clangxx"; then
                    flag="-Oz"
                else
                    flag="-Os"
                fi
            elif test_eq "${value}" "aggressive"; then
                flag="-Ofast"
            elif test_eq "${value}" "none"; then
                flag="-O0"
            fi
            ;;
        languages)
            if test_eq "${toolkind}" "cc" || test_eq "${toolkind}" "mm"; then
                case "${value}" in
                    ansi) flag="-ansi";;
                    c89) flag="-std=c89";;
                    gnu89) flag="-std=gnu89";;
                    c99) flag="-std=c99";;
                    gnu99) flag="-std=gnu99";;
                    c11) flag="-std=c11";;
                    gnu11) flag="-std=gnu11";;
                    c17) flag="-std=c17";;
                    gnu17) flag="-std=gnu17";;
                esac
            elif test_eq "${toolkind}" "cxx" || test_eq "${toolkind}" "mxx"; then
                case "${value}" in
                    cxx98) flag="-std=c++98";;
                    c++98) flag="-std=c++98";;
                    gnuxx98) flag="-std=gnu++98";;
                    gnu++98) flag="-std=gnu++98";;

                    cxx11) flag="-std=c++11";;
                    c++11) flag="-std=c++11";;
                    gnuxx11) flag="-std=gnu++11";;
                    gnu++11) flag="-std=gnu++11";;

                    cxx14) flag="-std=c++14";;
                    c++14) flag="-std=c++14";;
                    gnuxx14) flag="-std=gnu++14";;
                    gnu++14) flag="-std=gnu++14";;

                    cxx17) flag="-std=c++17";;
                    c++17) flag="-std=c++17";;
                    gnuxx17) flag="-std=gnu++17";;
                    gnu++17) flag="-std=gnu++17";;

                    cxx1z) flag="-std=c++1z";;
                    c++1z) flag="-std=c++1z";;
                    gnuxx1z) flag="-std=gnu++1z";;
                    gnu++1z) flag="-std=gnu++1z";;

                    cxx2a) flag="-std=c++2a";;
                    c++2a) flag="-std=c++2a";;
                    gnuxx2a) flag="-std=gnu++2a";;
                    gnu++2a) flag="-std=gnu++2a";;

                    cxx20) flag="-std=c++20";;
                    c++20) flag="-std=c++20";;
                    gnuxx20) flag="-std=gnu++20";;
                    gnu++20) flag="-std=gnu++20";;
                    cxx*) raise "unknown language value(${value})!" ;;
                    c++*) raise "unknown language value(${value})!" ;;
                esac
            fi
            ;;
        *) raise "unknown itemname(${itemname})!" ;;
    esac
    _ret="${flag}"
}

# get abstract flags
_get_abstract_flags() {
    local toolkind="${1}"
    local toolname="${2}"
    local itemname="${3}"
    local values="${4}"
    local flags=""
    local value=""
    for value in ${values}; do
        local flag=""
        case "${toolname}" in
            gcc) _get_abstract_flag_for_gcc_clang "${toolkind}" "${toolname}" "${itemname}" "${value}"; flag="${_ret}";;
            gxx) _get_abstract_flag_for_gcc_clang "${toolkind}" "${toolname}" "${itemname}" "${value}"; flag="${_ret}";;
            clang) _get_abstract_flag_for_gcc_clang "${toolkind}" "${toolname}" "${itemname}" "${value}"; flag="${_ret}";;
            clangxx) _get_abstract_flag_for_gcc_clang "${toolkind}" "${toolname}" "${itemname}" "${value}"; flag="${_ret}";;
            *) raise "unknown toolname(${toolname})!" ;;
        esac
        if test_nz "${flag}"; then
            flags="${flags} ${flag}"
        fi
    done
    _ret="${flags}"
}

#-----------------------------------------------------------------------------
# option configuration apis
#

# define option
option() {
    local name="${1}"
    local description="${2}"
    local default=${3}
    _xmake_sh_option_current="${name}"
    if ! ${_loading_options}; then
        if test_nz "${description}"; then
            _xmake_sh_option_current=""
        fi
        return
    fi
    _xmake_sh_options="${_xmake_sh_options} ${name}"
    _map_set "options" "${name}_name" "${name}"
    _map_set "options" "${name}_description" "${description}"
    _map_set "options" "${name}_default" "${default}"
    # we end option if it's just one line
    if test_nz "${description}"; then
        _xmake_sh_option_current=""
    fi
    return 0
}
option_end() {
    _xmake_sh_option_current=""
}
_map "options"

# has the given option?
_has_option() {
    local name=${1}
    if _map_has "options" "${name}_name"; then
        return 0
    fi
    return 1
}

# get the given option item
_get_option_item() {
    local name=${1}
    local key=${2}
    _map_get "options" "${name}_${key}"
}

# set the given option item
_set_option_item() {
    local name=${1}
    local key=${2}
    local value=${3}
    if test_nz "${name}"; then
        _map_set "options" "${name}_${key}" "${value}"
    else
        raise "please call set_${key}(${value}) in the option scope!"
    fi
}

# add values to the given option item
_add_option_item() {
    local name=${1}
    local key=${2}
    local value=${3}
    if test_nz "${name}"; then
        _map_get "options" "${name}_${key}"; local values="${_ret}"
        values="${values} ${value}"
        _map_set "options" "${name}_${key}" "${values}"
    else
        raise "please call add_${key}(${value}) in the option scope!"
    fi
}

# get the give option value
_get_option_value() {
    local name=${1}
    _get_option_item "${name}" "value"
    if test "x${_ret}" = "x"; then
        _get_option_item "${name}" "default"
    fi
}

# set the give option value
_set_option_value() {
    local name=${1}
    local value=${2}
    _set_option_item "${name}" "value" "${value}"
}

# this option need checking?
_option_need_checking() {
    local name="${1}"
    _get_option_item "${name}" "default"; local default="${_ret}"
    if test_nz "${default}"; then
        return 1
    fi
    _get_option_item "${name}" "cfuncs"; local cfuncs="${_ret}"
    _get_option_item "${name}" "cxxfuncs"; local cxxfuncs="${_ret}"
    _get_option_item "${name}" "cincludes"; local cincludes="${_ret}"
    _get_option_item "${name}" "cxxincludes"; local cxxincludes="${_ret}"
    _get_option_item "${name}" "ctypes"; local ctypes="${_ret}"
    _get_option_item "${name}" "cxxtypes"; local cxxtypes="${_ret}"
    _get_option_item "${name}" "csnippets"; local csnippets="${_ret}"
    _get_option_item "${name}" "cxxsnippets"; local cxxsnippets="${_ret}"
    _get_option_item "${name}" "links"; local links="${_ret}"
    _get_option_item "${name}" "syslinks"; local syslinks="${_ret}"
    if test_nz "${cfuncs}" || test_nz "${cxxfuncs}" ||
       test_nz "${cincludes}" || test_nz "${cxxincludes}" ||
       test_nz "${ctypes}" || test_nz "${cxxtypes}" ||
       test_nz "${csnippets}" || test_nz "${cxxsnippets}" ||
       test_nz "${links}" || test_nz "${syslinks}"; then
        return 0
    fi
    return 1
}

# get options for the help menu
_get_options_for_menu() {
    local options=""
    local name=""
    for name in ${_xmake_sh_options}; do
        _get_option_item "${name}" "showmenu"; local showmenu="${_ret}"
        if _is_enabled "${showmenu}"; then
            options="${options} ${name}"
        elif test_z "${showmenu}" && ! _option_need_checking "${name}"; then
            options="${options} ${name}"
        fi
    done
    _ret="${options}"
}

# get options for checking
_get_options_for_checking() {
    local options=""
    local name=""
    for name in ${_xmake_sh_options}; do
        _get_option_item "${name}" "showmenu"; local showmenu="${_ret}"
        if test_z "${showmenu}" && _option_need_checking "${name}"; then
            options="${options} ${name}"
        fi
    done
    _ret="${options}"
}

# get abstract flags in option
_get_option_abstract_flags() {
    local name="${1}"
    local toolkind="${2}"
    local toolname="${3}"
    local itemname="${4}"
    local values="${5}"
    if test_z "${values}"; then
        _get_option_item "${name}" "${itemname}"; values="${_ret}"
    fi
    _get_abstract_flags "${toolkind}" "${toolname}" "${itemname}" "${values}"
}

# is config for option
is_config() {
    if ! ${_loading_targets}; then
        return 1
    fi
    local name=${1}
    local value=${2}
    _get_option_value "${name}"; local value_cur="${_ret}"
    if test_eq "${value_cur}" "${value}"; then
        return 0
    fi
    return 1
}

# has config for option
has_config() {
    if ! ${_loading_targets}; then
        return 1
    fi
    local name=${1}
    _get_option_value "${name}"; local value_cur="${_ret}"
    if _is_enabled ${value_cur}; then
        return 0
    fi
    return 1
}

# set config for option, we can use it to modify option status when loading targets
set_config() {
    local name=${1}
    local value=${2}
    _set_option_value "${name}" "${value}"
}

# set showmenu in option
set_showmenu() {
    if ! ${_loading_options}; then
        return
    fi
    local show="${1}"
    _set_option_item "${_xmake_sh_option_current}" "showmenu" "${show}"
}

# set description in option
set_description() {
    if ! ${_loading_options}; then
        return
    fi
    local description="${1}"
    _set_option_item "${_xmake_sh_option_current}" "description" "${description}"
}

# add cfuncs in option
add_cfuncs() {
    if ! ${_loading_options}; then
        return
    fi
    local cfuncs="${1}"
    _add_option_item "${_xmake_sh_option_current}" "cfuncs" "${cfuncs}"
}

# add cxxfuncs in option
add_cxxfuncs() {
    if ! ${_loading_options}; then
        return
    fi
    local cxxfuncs="${1}"
    _add_option_item "${_xmake_sh_option_current}" "cxxfuncs" "${cxxfuncs}"
}

# add cincludes in option
add_cincludes() {
    if ! ${_loading_options}; then
        return
    fi
    local cincludes="${1}"
    _add_option_item "${_xmake_sh_option_current}" "cincludes" "${cincludes}"
}

# add cxxincludes in option
add_cxxincludes() {
    if ! ${_loading_options}; then
        return
    fi
    local cxxincludes="${1}"
    _add_option_item "${_xmake_sh_option_current}" "cxxincludes" "${cxxincludes}"
}

# add ctypes in option
add_ctypes() {
    if ! ${_loading_options}; then
        return
    fi
    local ctypes="${1}"
    _add_option_item "${_xmake_sh_option_current}" "ctypes" "${ctypes}"
}

# add cxxtypes in option
add_cxxtypes() {
    if ! ${_loading_options}; then
        return
    fi
    local cxxtypes="${1}"
    _add_option_item "${_xmake_sh_option_current}" "cxxtypes" "${cxxtypes}"
}

# add csnippets in option
add_csnippets() {
    if ! ${_loading_options}; then
        return
    fi
    local csnippets="${1}"
    _add_option_item "${_xmake_sh_option_current}" "csnippets" "${csnippets}"
}

# add cxxsnippets in option
add_cxxsnippets() {
    if ! ${_loading_options}; then
        return
    fi
    local cxxsnippets="${1}"
    _add_option_item "${_xmake_sh_option_current}" "cxxsnippets" "${cxxsnippets}"
}

#-----------------------------------------------------------------------------
# target configuration apis
#

# define target
target() {
    local name="${1}"
    _xmake_sh_target_current="${name}"
    if ! ${_loading_targets}; then
        return
    fi
    _xmake_sh_targets="${_xmake_sh_targets} ${name}"
    _map_set "targets" "${name}_name" "${name}"
    return 0
}
target_end() {
    _xmake_sh_target_current=""
}
_map "targets"

# has the given target?
_has_target() {
    local name=${1}
    if _map_has "targets" "${name}_name"; then
        return 0
    fi
    return 1
}

# has the given target item
_has_target_item() {
    local name=${1}
    local key=${2}
    if _map_has "targets" "${name}_${key}"; then
        return 0
    elif _map_has "targets" "__root_${key}"; then
        return 0
    fi
    return 1
}

# get the given target item
_get_target_item() {
    local name=${1}
    local key=${2}
    _map_get "targets" "${name}_${key}"
    local values="${_ret}"
    if _map_has "targets" "__root_${key}"; then
        _map_get "targets" "__root_${key}"; local root_values="${_ret}"
        if test_nz "${values}"; then
            values="${root_values} ${values}"
        else
            values="${root_values}"
        fi
    fi
    _ret="${values}"
}

# set the given target item
_set_target_item() {
    local name=${1}
    local key=${2}
    local value=${3}
    if test_nz "${name}"; then
        _map_set "targets" "${name}_${key}" "${value}"
    else
        _map_set "targets" "__root_${key}" "${value}"
    fi
}

# add values to the given target item
_add_target_item() {
    local name=${1}
    local key=${2}
    local value=${3}
    if test_nz "${name}"; then
        _map_get "targets" "${name}_${key}"; local values="${_ret}"
        values="${values} ${value}"
        _map_set "targets" "${name}_${key}" "${values}"
    else
        _map_get "targets" "__root_${key}"; local values="${_ret}"
        values="${values} ${value}"
        _map_set "targets" "__root_${key}" "${values}"
    fi
}

# is default?
_is_target_default() {
    local name="${1}"
    if _has_target_item "${name}" "default"; then
        _get_target_item "${target}" "default"; local default="${_ret}"
        if _is_enabled ${default}; then
            return 0
        fi
        return 1
    fi
    return 0
}

# get target basename
_get_target_basename() {
    local name="${1}"
    _get_target_item "${name}" "basename"; local basename="${_ret}"
    if test_z "${basename}"; then
        basename="${name}"
    fi
    _ret="${basename}"
}

# get target extension
_get_target_extension() {
    local name="${1}"
    local extension=""
    if _has_target_item "${name}" "extension"; then
        _get_target_item "${name}" "extension"; extension="${_ret}"
    elif is_plat "mingw"; then
        _get_target_item "${name}" "kind"; local kind="${_ret}"
        if test "x${kind}" = "xbinary"; then
            extension=".exe"
        elif test "x${kind}" = "xstatic"; then
            extension=".a"
        elif test "x${kind}" = "xshared"; then
            extension=".dll"
        fi
    else
        _get_target_item "${name}" "kind"; local kind="${_ret}"
        if test "x${kind}" = "xstatic"; then
            extension=".a"
        elif test "x${kind}" = "xshared"; then
            extension=".so"
        fi
    fi
    _ret="${extension}"
}

# get target prefixname
_get_target_prefixname() {
    local name="${1}"
    local prefixname=""
    if _has_target_item "${name}" "prefixname"; then
        _get_target_item "${name}" "prefixname"; prefixname="${_ret}"
    elif is_plat "mingw"; then
        _get_target_item "${name}" "kind"; local kind="${_ret}"
        if test "x${kind}" = "xstatic"; then
            prefixname="lib"
        elif test "x${kind}" = "xshared"; then
            prefixname="lib"
        fi
    else
        _get_target_item "${name}" "kind"; local kind="${_ret}"
        if test "x${kind}" = "xstatic"; then
            prefixname="lib"
        elif test "x${kind}" = "xshared"; then
            prefixname="lib"
        fi
    fi
    _ret="${prefixname}"
}

# get target filename
_get_target_filename() {
    local name="${1}"
    _get_target_item "${name}" "filename"; local filename="${_ret}"
    if test_z "${filename}"; then
        _get_target_basename "${name}"; local basename="${_ret}"
        _get_target_extension "${name}"; local extension="${_ret}"
        _get_target_prefixname "${name}"; local prefixname="${_ret}"
        filename="${prefixname}${basename}${extension}"
    fi
    _ret="${filename}"
}

# get target directory
_get_targetdir() {
    local name="${1}"
    _get_target_item "${name}" "targetdir"; local targetdir="${_ret}"
    if test_z "${targetdir}"; then
        targetdir="${xmake_sh_buildir}/${_target_plat}/${_target_arch}/${_target_mode}"
    fi
    _ret="${targetdir}"
}

# get target object directory
_get_target_objectdir() {
    local name="${1}"
    _get_target_item "${name}" "objectdir"; local objectdir="${_ret}"
    if test_z "${objectdir}"; then
        objectdir="${xmake_sh_buildir}/.objs/${name}/${_target_plat}/${_target_arch}/${_target_mode}"
    fi
    _ret="${objectdir}"
}

# get target file path
_get_target_file() {
    local name="${1}"
    _get_target_filename "${name}"; local filename="${_ret}"
    _get_targetdir "${name}"; local targetdir="${_ret}"
    local targetfile="${targetdir}/${filename}"
    _ret="${targetfile}"
}

# get sourcefiles in target
_get_target_sourcefiles() {
    local name="${1}"
    _get_target_item "${name}" "files"
}

# get objectfile in target
_get_target_objectfile() {
    local name="${1}"
    local sourcefile="${2}"
    local extension=".o"
    if is_plat "mingw"; then
        extension=".obj"
    fi
    _get_target_objectdir "${name}"; local objectdir="${_ret}"
    local objectfile="${objectdir}/${sourcefile}${extension}"
    _ret="${objectfile}"
}

# get objectfiles in target
_get_target_objectfiles() {
    local name="${1}"
    _get_target_sourcefiles "${name}"; local sourcefiles="${_ret}"
    local objectfiles=""
    local sourcefile=""
    for sourcefile in ${sourcefiles}; do
        _get_target_objectfile "${name}" "${sourcefile}"; local objectfile="${_ret}"
        objectfiles="${objectfiles} ${objectfile}"
    done
    _ret="${objectfiles}"
}

# get abstract flags in target
_get_target_abstract_flags() {
    local name="${1}"
    local toolkind="${2}"
    local toolname="${3}"
    local itemname="${4}"
    local values="${5}"
    if test_z "${values}"; then

        # get values from target
        _get_target_item "${name}" "${itemname}"; values="${_ret}"

        # get values from target deps
        _get_target_item "${name}" "deps"; local deps="${_ret}"
        local dep=""
        for dep in ${deps}; do
            _get_target_item "${dep}" "kind"; local dep_kind="${_ret}"
            if test_eq "${dep_kind}" "static" || test_eq "${dep_kind}" "shared"; then
                _get_target_item "${dep}" "${itemname}_public"; local depvalues="${_ret}"
                if test_nz "${depvalues}"; then
                    values="${values} ${depvalues}"
                fi
            fi
        done
    fi
    _get_abstract_flags "${toolkind}" "${toolname}" "${itemname}" "${values}"
}

# get toolchain flags for ar in target
_get_target_toolchain_flags_for_ar() {
    _ret="-cr"
}

# get toolchain flags for gcc in target
_get_target_toolchain_flags_for_gcc() {
    local name="${1}"
    local toolkind="${2}"
    local flags=""
    _get_target_item "${name}" "kind"; local targetkind="${_ret}"
    if test_eq "${targetkind}" "shared" && test_eq "${toolkind}" "sh"; then
        flags="-shared -fPIC"
    fi
    _ret="${flags}"
}

# get toolchain flags for clang in target
_get_target_toolchain_flags_for_clang() {
    local name="${1}"
    local toolkind="${2}"
    local flags="-Qunused-arguments"
    _get_target_item "${name}" "kind"; local targetkind="${_ret}"
    if test_eq "${targetkind}" "shared" && test_eq "${toolkind}" "sh"; then
        flags="-shared -fPIC"
    fi
    _ret="${flags}"
}

# get toolchain flags in target
_get_target_toolchain_flags() {
    local name="${1}"
    local toolkind="${2}"
    local toolname="${3}"
    local flags=""
    case "${toolname}" in
        gcc) _get_target_toolchain_flags_for_gcc "${name}" "${toolkind}"; flags="${_ret}";;
        gxx) _get_target_toolchain_flags_for_gcc "${name}" "${toolkind}"; flags="${_ret}";;
        clang) _get_target_toolchain_flags_for_clang "${name}" "${toolkind}"; flags="${_ret}";;
        clangxx) _get_target_toolchain_flags_for_clang "${name}" "${toolkind}"; flags="${_ret}";;
        ar) _get_target_toolchain_flags_for_ar "${name}" "${toolkind}"; flags="${_ret}";;
        *) raise "unknown toolname(${toolname})!" ;;
    esac
    _ret="${flags}"
}

# get compiler flags in target
_get_target_compiler_flags() {
    local name="${1}"
    local toolkind="${2}"
    _get_toolchain_toolset "${_target_toolchain}" "${toolkind}"; local program="${_ret}"
    path_toolname "${program}"; local toolname="${_ret}"
    local result=""

    # get toolchain flags
    _get_target_toolchain_flags "${name}" "${toolkind}" "${toolname}"; local toolchain_flags="${_ret}"
    if test_nz "${toolchain_flags}"; then
        result="${result} ${toolchain_flags}"
    fi

    # get abstract flags
    local itemnames="symbols optimizes warnings languages defines undefines includedirs frameworkdirs frameworks"
    local itemname=""
    for itemname in ${itemnames}; do
        _get_target_abstract_flags "${name}" "${toolkind}" "${toolname}" "${itemname}"; local flags="${_ret}"
        if test_nz "${flags}"; then
            result="${result} ${flags}"
        fi
    done

    # get raw flags, e.g. add_cflags, add_cxxflags
    _get_flagname "${toolkind}"; local flagname="${_ret}"
    _get_target_item "${name}" "${flagname}"; local flags="${_ret}"
    if test_nz "${flags}"; then
        result="${result} ${flags}"
    fi
    if test_eq "${flagname}" "cflags" || test_eq "${flagname}" "cxxflags"; then
        _get_target_item "${name}" "cxflags"; flags="${_ret}"
        if test_nz "${flags}"; then
            result="${result} ${flags}"
        fi
    elif test_eq "${flagname}" "mflags" || test_eq "${flagname}" "mxxflags"; then
        _get_target_item "${name}" "mxflags"; flags="${_ret}"
        if test_nz "${flags}"; then
            result="${result} ${flags}"
        fi
    fi
    _ret="${result}"
}

# get linker flags in target
_get_target_linker_flags() {
    local name="${1}"
    local toolkind="${2}"
    _get_toolchain_toolset "${_target_toolchain}" "${toolkind}"; local program="${_ret}"
    path_toolname "${program}"; local toolname="${_ret}"
    local result=""

    # get toolchain flags
    _get_target_toolchain_flags "${name}" "${toolkind}" "${toolname}"; local toolchain_flags="${_ret}"
    if test_nz "${toolchain_flags}"; then
        result="${result} ${toolchain_flags}"
    fi

    # get flags from target deps
    _get_target_item "${name}" "deps"; local deps="${_ret}"
    local dep=""
    for dep in ${deps}; do
        _get_target_item "${dep}" "kind"; local dep_kind="${_ret}"
        if test_eq "${dep_kind}" "static" || test_eq "${dep_kind}" "shared"; then
            _get_targetdir "${dep}"; local dep_targetdir="${_ret}"
            _get_target_basename "${dep}"; local dep_basename="${_ret}"
            _get_target_abstract_flags "${dep}" "${toolkind}" "${toolname}" "linkdirs" "${dep_targetdir}"; local linkdirs_flags="${_ret}"
            _get_target_abstract_flags "${dep}" "${toolkind}" "${toolname}" "links" "${dep_basename}"; local links_flags="${_ret}"
            if test_eq "${dep_kind}" "shared"; then
                local rpathdir="@loader_path"
                _get_targetdir "${name}"; local targetdir="${_ret}"
                path_relative "${targetdir}" "${dep_targetdir}"; local subdir="${_ret}"
                if test_nz "${subdir}"; then
                    rpathdir="${rpathdir}/${subdir}"
                fi
                _get_target_abstract_flags "${dep}" "${toolkind}" "${toolname}" "rpathdirs" "${rpathdir}"; local rpathdirs_flags="${_ret}"
                result="${result} ${rpathdirs_flags}"
            fi
            result="${result} ${linkdirs_flags} ${links_flags}"
        fi
    done

    # get abstract flags
    local itemnames="strip frameworkdirs linkdirs links rpathdirs frameworks syslinks"
    local itemname=""
    for itemname in ${itemnames}; do
        _get_target_abstract_flags "${name}" "${toolkind}" "${toolname}" "${itemname}"; local flags="${_ret}"
        if test_nz "${flags}"; then
            result="${result} ${flags}"
        fi
    done

    # get raw flags, e.g. add_ldflags, add_shflags
    _get_flagname "${toolkind}"; local flagname="${_ret}"
    _get_target_item "${name}" "${flagname}"; local flags="${_ret}"
    if test_nz "${flags}"; then
        result="${result} ${flags}"
    fi

    _ret="${result}"
}

# get archiver flags in target
_get_target_archiver_flags() {
    local name="${1}"
    local toolkind="${2}"
    _get_toolchain_toolset "${_target_toolchain}" "${toolkind}"; local program="${_ret}"
    path_toolname "${program}"; local toolname="${_ret}"
    local result=""

    # get toolchain flags
    _get_target_toolchain_flags "${name}" "${toolkind}" "${toolname}"; local toolchain_flags="${_ret}"
    if test_nz "${toolchain_flags}"; then
        result="${result} ${toolchain_flags}"
    fi

    # get raw flags, e.g. add_arflags
    _get_flagname "${toolkind}"; local flagname="${_ret}"
    _get_target_item "${name}" "${flagname}"; local flags="${_ret}"
    if test_nz "${flags}"; then
        result="${result} ${flags}"
    fi

    _ret="${result}"
}

# get target flags
_get_target_flags() {
    local name="${1}"
    local toolkind="${2}"
    local flags=""
    if test_eq "${toolkind}" "sh"; then
        _get_target_linker_flags "${name}" "${toolkind}"; flags="${_ret}"
    elif test_eq "${toolkind}" "ld"; then
        _get_target_linker_flags "${name}" "${toolkind}"; flags="${_ret}"
    elif test_eq "${toolkind}" "ar"; then
        _get_target_archiver_flags "${name}" "${toolkind}"; flags="${_ret}"
    else
        _get_target_compiler_flags "${name}" "${toolkind}"; flags="${_ret}"
    fi
    _ret="${flags}"
}

# add file paths in target
_add_target_filepaths() {
    local key="$1"
    shift
    # we need avoid escape `*` automatically in for-loop
    local file=""
    string_replace "${@}" "\*" "?"; local list="${_ret}"
    if test_eq "${key}" "files"; then
        for file in ${list}; do
            path_sourcekind "${file}"; local sourcekind="${_ret}"
            _targets_toolkinds="${_targets_toolkinds} ${sourcekind}"
        done
    fi
    for file in ${list}; do
        string_replace "${file}" "?" "*"; file="${_ret}"
        if ! path_is_absolute "${file}"; then
            file="${xmake_sh_scriptdir}/${file}"
        fi
        local files=""
        if string_contains_star2 "${file}"; then
            path_directory "${file}"; local dir="${_ret}"
            path_filename_fromdir "${file}" "${dir}"; local name="${_ret}"
            _os_find "${dir}" "${name}"; files="${_ret}"
        elif string_contains_star "${file}"; then
            path_directory "${file}"; local dir="${_ret}"
            path_filename_fromdir "${file}" "${dir}"; local name="${_ret}"
            _os_find "${dir}" "${name}" 1; files="${_ret}"
        else
            files="${file}"
        fi
        for file in ${files}; do
            path_relative "${xmake_sh_projectdir}" "${file}"; file="${_ret}"
            _add_target_item "${_xmake_sh_target_current}" "${key}" "${file}"
        done
    done
}

# add install paths in target
_add_target_installpaths() {
    local key="$1"
    local filepattern="${2}"
    local prefixdir="${3}"

    # get root directory, e.g. "src/foo/(*.h)" -> "src/foo"
    local rootdir=""
    if string_contains "${filepattern}" "("; then
        string_split "${filepattern}" "(" 1; rootdir="${_ret}"
        rootdir=${rootdir%/}
        if ! path_is_absolute "${rootdir}"; then
            rootdir="${xmake_sh_scriptdir}/${rootdir}"
        fi
        path_relative "${xmake_sh_projectdir}" "${rootdir}"; rootdir="${_ret}"
        rootdir=${rootdir%/}
    fi

    # remove (), e.g. "src/(*.h)" -> "src/*.h"
    string_replace ${filepattern} "(" ""; filepattern="${_ret}"
    string_replace ${filepattern} ")" ""; filepattern="${_ret}"

    # get real path
    if ! path_is_absolute "${filepattern}"; then
        filepattern="${xmake_sh_scriptdir}/${filepattern}"
    fi
    local files=""
    if string_contains_star2 "${filepattern}"; then
        path_directory "${filepattern}"; local dir="${_ret}"
        path_filename_fromdir "${filepattern}" "${dir}"; local name="${_ret}"
        _os_find "${dir}" "${name}"; files="${_ret}"
    elif string_contains_star "${filepattern}"; then
        path_directory "${filepattern}"; local dir="${_ret}"
        path_filename_fromdir "${filepattern}" "${dir}"; local name="${_ret}"
        _os_find "${dir}" "${name}" 1; files="${_ret}"
    else
        files="${filepattern}"
    fi
    for file in ${files}; do
        path_relative "${xmake_sh_projectdir}" "${file}"; file="${_ret}"
        _add_target_item "${_xmake_sh_target_current}" "${key}" "${file}:${rootdir}:${prefixdir}"
    done
}

# set target file path
_set_target_filepath() {
    local key="${1}"
    local path="${2}"
    if ! path_is_absolute "${path}"; then
        path="${xmake_sh_scriptdir}/${path}"
    fi
    path_relative ${xmake_sh_projectdir} "${path}"; path="${_ret}"
    _set_target_item "${_xmake_sh_target_current}" "${key}" "${path}"
}

# set kind in target
set_kind() {
    if ! ${_loading_targets}; then
        return
    fi
    local kind=${1}
    _set_target_item "${_xmake_sh_target_current}" "kind" "${kind}"
    case "${kind}" in
        binary) _targets_toolkinds="${_targets_toolkinds} ld";;
        static) _targets_toolkinds="${_targets_toolkinds} ar";;
        shared) _targets_toolkinds="${_targets_toolkinds} sh";;
        *) raise "unknown target kind ${kind}";;
    esac
}

# set version in target
set_version() {
    if ! ${_loading_targets}; then
        return
    fi
    local version="${1}"
    local version_build="${2}"
    _set_target_item "${_xmake_sh_target_current}" "version" "${version}"
    _set_target_item "${_xmake_sh_target_current}" "version_build" "${version_build}"
}

# set default in target
set_default() {
    local default=${1}
    if ${_loading_targets} && test_z "${_xmake_sh_option_current}"; then
        _set_target_item "${_xmake_sh_target_current}" "default" "${default}"
    elif ${_loading_options} && test_nz "${_xmake_sh_option_current}"; then
        _set_option_item "${_xmake_sh_option_current}" "default" "${default}"
    fi
}

# set configvar in target
set_configvar() {
    if ! ${_loading_targets}; then
        return
    fi
    local name="${1}"
    local value="${2}"
    _set_target_item "${_xmake_sh_target_current}" "configvar_${name}" "${value}"
    _add_target_item "${_xmake_sh_target_current}" "configvars" "${name}"
}

# set filename in target
set_filename() {
    if ! ${_loading_targets}; then
        return
    fi
    local filename="${1}"
    _set_target_item "${_xmake_sh_target_current}" "filename" "${filename}"
}

# set basename in target
set_basename() {
    if ! ${_loading_targets}; then
        return
    fi
    local basename="${1}"
    _set_target_item "${_xmake_sh_target_current}" "basename" "${basename}"
}

# set extension in target
set_extension() {
    if ! ${_loading_targets}; then
        return
    fi
    local extension=${1}
    _set_target_item "${_xmake_sh_target_current}" "extension" "${extension}"
}

# set prefixname in target
set_prefixname() {
    if ! ${_loading_targets}; then
        return
    fi
    local prefixname=${1}
    _set_target_item "${_xmake_sh_target_current}" "prefixname" "${prefixname}"
}

# set target directory
set_targetdir() {
    if ! ${_loading_targets}; then
        return
    fi
    _set_target_filepath "targetdir" "${1}"
}

# set target object directory
set_objectdir() {
    if ! ${_loading_targets}; then
        return
    fi
    _set_target_filepath "objectdir" "${1}"
}

# set target config directory
set_configdir() {
    if ! ${_loading_targets}; then
        return
    fi
    _set_target_filepath "configdir" "${1}"
}

# set target install directory
set_installdir() {
    if ! ${_loading_targets}; then
        return
    fi
    _set_target_filepath "installdir" "${1}"
}

# add deps in target
add_deps() {
    if ! ${_loading_targets}; then
        return
    fi
    local dep=""
    for dep in $@; do
        _add_target_item "${_xmake_sh_target_current}" "deps" "${dep}"
    done
}

# add files in target
add_files() {
    if ! ${_loading_targets}; then
        return
    fi
    _add_target_filepaths "files" "$@"
}

# add install files in target
add_installfiles() {
    if ! ${_loading_targets}; then
        return
    fi
    _add_target_installpaths "installfiles" "$@"
}

# add header files in target
add_headerfiles() {
    if ! ${_loading_targets}; then
        return
    fi
    _add_target_installpaths "headerfiles" "$@"
}

# add config files in target
add_configfiles() {
    if ! ${_loading_targets}; then
        return
    fi
    _add_target_filepaths "configfiles" "$@"
}

# add defines in target
add_defines() {
    local define=""
    if ${_loading_targets} && test_z "${_xmake_sh_option_current}"; then
        local public=false
        for define in $@; do
            if test_nq "${define}" "{public}"; then
                _add_target_item "${_xmake_sh_target_current}" "defines" "${define}"
            else
                public=true
            fi
        done
        if ${public}; then
            for define in $@; do
                if test_nq "${define}" "{public}"; then
                    _add_target_item "${_xmake_sh_target_current}" "defines_public" "${define}"
                fi
            done
        fi
    elif ${_loading_options} && test_nz "${_xmake_sh_option_current}"; then
        for define in $@; do
            _add_option_item "${_xmake_sh_option_current}" "defines" "${define}"
        done
    fi
}

# add udefines in target
add_udefines() {
    local undefine=""
    if ${_loading_targets} && test_z "${_xmake_sh_option_current}"; then
        local public=false
        for undefine in $@; do
            if test_nq "${undefine}" "{public}"; then
                _add_target_item "${_xmake_sh_target_current}" "undefines" "${undefine}"
            else
                public=true
            fi
        done
        if ${public}; then
            for undefine in $@; do
                if test_nq "${undefine}" "{public}"; then
                    _add_target_item "${_xmake_sh_target_current}" "undefines_public" "${undefine}"
                fi
            done
        fi
    elif ${_loading_options} && test_nz "${_xmake_sh_option_current}"; then
        for udefine in $@; do
            _add_option_item "${_xmake_sh_option_current}" "udefines" "${udefine}"
        done
    fi
}

# add includedirs in target
add_includedirs() {
    local public=false
    local dir=""
    for dir in $@; do
        if test_nq "${dir}" "{public}"; then
            if ! path_is_absolute "${dir}"; then
                dir="${xmake_sh_scriptdir}/${dir}"
            fi
            path_relative ${xmake_sh_projectdir} "${dir}"; dir="${_ret}"
            if ${_loading_targets} && test_z "${_xmake_sh_option_current}"; then
                _add_target_item "${_xmake_sh_target_current}" "includedirs" "${dir}"
            elif ${_loading_options} && test_nz "${_xmake_sh_option_current}"; then
                _add_option_item "${_xmake_sh_option_current}" "includedirs" "${dir}"
            fi
        else
            public=true
        fi
    done
    if ${public}; then
        for dir in $@; do
            if test_nq "${dir}" "{public}"; then
                if ! path_is_absolute "${dir}"; then
                    dir="${xmake_sh_scriptdir}/${dir}"
                fi
                path_relative ${xmake_sh_projectdir} "${dir}"; dir="${_ret}"
                if ${_loading_targets} && test_z "${_xmake_sh_option_current}"; then
                    _add_target_item "${_xmake_sh_target_current}" "includedirs_public" "${dir}"
                fi
            fi
        done
    fi
}

# add links in target
add_links() {
    local link=""
    if ${_loading_targets} && test_z "${_xmake_sh_option_current}"; then
        local public=false
        for link in $@; do
            if test_nq "${link}" "{public}"; then
                _add_target_item "${_xmake_sh_target_current}" "links" "${link}"
            else
                public=true
            fi
        done
        if ${public}; then
            for link in $@; do
                if test_nq "${link}" "{public}"; then
                    _add_target_item "${_xmake_sh_target_current}" "links_public" "${link}"
                fi
            done
        fi
    elif ${_loading_options} && test_nz "${_xmake_sh_option_current}"; then
        for link in $@; do
            _add_option_item "${_xmake_sh_option_current}" "links" "${link}"
        done
    fi
}

# add syslinks in target
add_syslinks() {
    local syslink=""
    if ${_loading_targets} && test_z "${_xmake_sh_option_current}"; then
        local public=false
        for syslink in $@; do
            if test_nq "${syslink}" "{public}"; then
                _add_target_item "${_xmake_sh_target_current}" "syslinks" "${syslink}"
            else
                public=true
            fi
        done
        if ${public}; then
            for syslink in $@; do
                if test_nq "${syslink}" "{public}"; then
                    _add_target_item "${_xmake_sh_target_current}" "syslinks_public" "${syslink}"
                fi
            done
        fi
    elif ${_loading_options} && test_nz "${_xmake_sh_option_current}"; then
        for syslink in $@; do
            _add_option_item "${_xmake_sh_option_current}" "syslinks" "${syslink}"
        done
    fi
}

# add linkdirs in target
add_linkdirs() {
    local dir=""
    local public=false
    for dir in $@; do
        if test_nq "${dir}" "{public}"; then
            if ! path_is_absolute "${dir}"; then
                dir="${xmake_sh_scriptdir}/${dir}"
            fi
            path_relative ${xmake_sh_projectdir} "${dir}"; dir="${_ret}"
            if ${_loading_targets} && test_z "${_xmake_sh_option_current}"; then
                _add_target_item "${_xmake_sh_target_current}" "linkdirs" "${dir}"
            elif ${_loading_options} && test_nz "${_xmake_sh_option_current}"; then
                _add_option_item "${_xmake_sh_option_current}" "linkdirs" "${dir}"
            fi
        else
            public=true
        fi
    done
    if ${public}; then
        for dir in $@; do
            if test_nq "${dir}" "{public}"; then
                if ! path_is_absolute "${dir}"; then
                    dir="${xmake_sh_scriptdir}/${dir}"
                fi
                path_relative ${xmake_sh_projectdir} "${dir}"; dir="${_ret}"
                if ${_loading_targets} && test_z "${_xmake_sh_option_current}"; then
                    _add_target_item "${_xmake_sh_target_current}" "linkdirs_public" "${dir}"
                fi
            fi
        done
    fi
}

# add rpathdirs in target
add_rpathdirs() {
    if ! ${_loading_targets}; then
        return
    fi
    local dir=""
    for dir in $@; do
        if ! path_is_absolute "${dir}"; then
            dir="${xmake_sh_scriptdir}/${dir}"
        fi
        path_relative ${xmake_sh_projectdir} "${dir}"; dir="${_ret}"
        _add_target_item "${_xmake_sh_target_current}" "rpathdirs" "${dir}"
    done
}

# add frameworks in target
add_frameworks() {
    local framework=""
    if ${_loading_targets} && test_z "${_xmake_sh_option_current}"; then
        local public=false
        for framework in $@; do
            if test_nq "${framework}" "{public}"; then
                _add_target_item "${_xmake_sh_target_current}" "frameworks" "${framework}"
            else
                public=true
            fi
        done
        if ${public}; then
            for framework in $@; do
                if test_nq "${framework}" "{public}"; then
                    _add_target_item "${_xmake_sh_target_current}" "frameworks_public" "${framework}"
                fi
            done
        fi
    elif ${_loading_options} && test_nz "${_xmake_sh_option_current}"; then
        for framework in $@; do
            _add_option_item "${_xmake_sh_option_current}" "frameworks" "${framework}"
        done
    fi
}

# add frameworkdirs in target
add_frameworkdirs() {
    local dir=""
    for dir in $@; do
        if ! path_is_absolute "${dir}"; then
            dir="${xmake_sh_scriptdir}/${dir}"
        fi
        path_relative ${xmake_sh_projectdir} "${dir}"; dir="${_ret}"
        if ${_loading_targets} && test_z "${_xmake_sh_option_current}"; then
            _add_target_item "${_xmake_sh_target_current}" "frameworkdirs" "${dir}"
        elif ${_loading_options} && test_nz "${_xmake_sh_option_current}"; then
            _add_option_item "${_xmake_sh_option_current}" "frameworkdirs" "${dir}"
        fi
    done
}

# set strip in target
set_strip() {
    if ! ${_loading_targets}; then
        return
    fi
    local strip=${1}
    _set_target_item "${_xmake_sh_target_current}" "strip" "${strip}"
}

# set symbols in target
set_symbols() {
    if ! ${_loading_targets}; then
        return
    fi
    local symbols="${1}"
    _set_target_item "${_xmake_sh_target_current}" "symbols" "${symbols}"
}

# set languages in target
set_languages() {
    local languages="${@}"
    if ${_loading_targets} && test_z "${_xmake_sh_option_current}"; then
        _set_target_item "${_xmake_sh_target_current}" "languages" "${languages}"
    elif ${_loading_options} && test_nz "${_xmake_sh_option_current}"; then
        _set_option_item "${_xmake_sh_option_current}" "languages" "${languages}"
    fi
}

# set warnings in target
set_warnings() {
    local warnings="${@}"
    if ${_loading_targets} && test_z "${_xmake_sh_option_current}"; then
        _set_target_item "${_xmake_sh_target_current}" "warnings" "${warnings}"
    elif ${_loading_options} && test_nz "${_xmake_sh_option_current}"; then
        _set_option_item "${_xmake_sh_option_current}" "warnings" "${warnings}"
    fi
}

# set optimizes in target
set_optimizes() {
    local optimizes="${@}"
    if ${_loading_targets} && test_z "${_xmake_sh_option_current}"; then
        _set_target_item "${_xmake_sh_target_current}" "optimizes" "${optimizes}"
    elif ${_loading_options} && test_nz "${_xmake_sh_option_current}"; then
        _set_option_item "${_xmake_sh_option_current}" "optimizes" "${optimizes}"
    fi
}

# add cflags in target
add_cflags() {
    local flag=""
    if ${_loading_targets} && test_z "${_xmake_sh_option_current}"; then
        for flag in $@; do
            _add_target_item "${_xmake_sh_target_current}" "cflags" "${flag}"
        done
    elif ${_loading_options} && test_nz "${_xmake_sh_option_current}"; then
        for flag in $@; do
            _add_option_item "${_xmake_sh_option_current}" "cflags" "${flag}"
        done
    fi
}

# add cxflags in target
add_cxflags() {
    local flag=""
    if ${_loading_targets} && test_z "${_xmake_sh_option_current}"; then
        for flag in $@; do
            _add_target_item "${_xmake_sh_target_current}" "cxflags" "${flag}"
        done
    elif ${_loading_options} && test_nz "${_xmake_sh_option_current}"; then
        for flag in $@; do
            _add_option_item "${_xmake_sh_option_current}" "cxflags" "${flag}"
        done
    fi
}

# add cxxflags in target
add_cxxflags() {
    local flag=""
    if ${_loading_targets} && test_z "${_xmake_sh_option_current}"; then
        for flag in $@; do
            _add_target_item "${_xmake_sh_target_current}" "cxxflags" "${flag}"
        done
    elif ${_loading_options} && test_nz "${_xmake_sh_option_current}"; then
        for flag in $@; do
            _add_option_item "${_xmake_sh_option_current}" "cxxflags" "${flag}"
        done
    fi
}

# add asflags in target
add_asflags() {
    if ! ${_loading_targets}; then
        return
    fi
    local flag=""
    for flag in $@; do
        _add_target_item "${_xmake_sh_target_current}" "asflags" "${flag}"
    done
}

# add mflags in target
add_mflags() {
    if ! ${_loading_targets}; then
        return
    fi
    local flag=""
    for flag in $@; do
        _add_target_item "${_xmake_sh_target_current}" "mflags" "${flag}"
    done
}

# add mxflags in target
add_mxflags() {
    if ! ${_loading_targets}; then
        return
    fi
    local flag=""
    for flag in $@; do
        _add_target_item "${_xmake_sh_target_current}" "mxflags" "${flag}"
    done
}

# add mxxflags in target
add_mxxflags() {
    if ! ${_loading_targets}; then
        return
    fi
    local flag=""
    for flag in $@; do
        _add_target_item "${_xmake_sh_target_current}" "mxxflags" "${flag}"
    done
}

# add ldflags in target
add_ldflags() {
    if ! ${_loading_targets}; then
        return
    fi
    local flag=""
    for flag in $@; do
        _add_target_item "${_xmake_sh_target_current}" "ldflags" "${flag}"
    done
}

# add shflags in target
add_shflags() {
    if ! ${_loading_targets}; then
        return
    fi
    local flag=""
    for flag in $@; do
        _add_target_item "${_xmake_sh_target_current}" "shflags" "${flag}"
    done
}

# add arflags in target
add_arflags() {
    if ! ${_loading_targets}; then
        return
    fi
    local flag=""
    for flag in $@; do
        _add_target_item "${_xmake_sh_target_current}" "arflags" "${flag}"
    done
}

#-----------------------------------------------------------------------------
# toolchain configuration apis
#

# define toolchain
toolchain() {
    local name="${1}"
    _xmake_sh_toolchain_current="${name}"
    if ! ${_loading_toolchains}; then
        return
    fi
    _xmake_sh_toolchains="${_xmake_sh_toolchains} ${name}"
    _map_set "toolchains" "${name}_name" "${name}"
    return 0
}
toolchain_end() {
    _xmake_sh_toolchain_current=""
}
_map "toolchains"

# has the given toolchain?
_has_toolchain() {
    local name=${1}
    if _map_has "toolchains" "${name}_name"; then
        return 0
    fi
    return 1
}

# get the given toolchain item
_get_toolchain_item() {
    local name=${1}
    local key=${2}
    _map_get "toolchains" "${name}_${key}"
}

# set the given toolchain item
_set_toolchain_item() {
    local name=${1}
    local key=${2}
    local value=${3}
    if test_nz "${name}"; then
        _map_set "toolchains" "${name}_${key}" "${value}"
    else
        raise "please set toolchain in the toolchain scope!"
    fi
}

# get the give toolchain toolset
_get_toolchain_toolset() {
    local name=${1}
    local kind=${2}
    _get_toolchain_item "${name}" "toolset_${kind}"
}

# set the give toolchain toolset
_set_toolchain_toolset() {
    local name=${1}
    local kind=${2}
    local programs="${3}"
    _set_toolchain_item "${name}" "toolset_${kind}" "${programs}"
}

# add the give toolchain toolset
_add_toolchain_toolset() {
    local name=${1}
    local kind=${2}
    local program="${3}"
    _get_toolchain_item "${name}" "toolset_${kind}"; local programs="${_ret}"
    if test_nz "${programs}"; then
        programs="${programs}:${program}"
    else
        programs="${program}"
    fi
    _set_toolchain_item "${name}" "toolset_${kind}" "${programs}"
}

# set toolset in toolchain
set_toolset() {
    if ! ${_loading_toolchains}; then
        return
    fi
    local kind=${1}
    shift
    local idx=0
    while test $# != 0; do
        local program="${1}"
        local key="${kind}"
        if test_nq "${idx}" "0"; then
            key="${key}_${idx}"
        fi
        _set_toolchain_toolset "${_xmake_sh_toolchain_current}" "${key}" "${program}"
        idx=$((idx+1))
        shift
    done
}

#-----------------------------------------------------------------------------
# load options
#

# load options and toolchains
_load_options_and_toolchains() {
    _loading_options=true
    _loading_toolchains=true
    _loading_targets=false
    local file=${xmake_sh_projectdir}/xmake.sh
    if test -f "${file}"; then
        includes "${file}"
    else
        # include all xmake.sh files in next sub-directories
        local files=`find ${xmake_sh_projectdir} -maxdepth 2 -mindepth 2 -name "xmake.sh"`
        for file in ${files}; do
            includes "${file}"
        done
    fi
}
_load_options_and_toolchains

# show option usage
_show_options_usage() {
    _get_options_for_menu; local options="${_ret}"
    for name in ${options}; do
        _get_option_item "${name}" "description"; local description="${_ret}"
        _get_option_item "${name}" "default"; local default="${_ret}"
        string_toupper ${name}; local head="--${name}="${_ret}""
        local headsize=${#head}
        local tail="${description}"
        if test "x${default}" != "x"; then
            local defval=${default}
            if test "x${defval}" = "xtrue"; then
                defval="yes"
            elif test "x${defval}" = "xfalse"; then
                defval="no"
            fi
            tail="${tail} (default: ${defval})"
        fi
        local width=24
        local padding_width=$((${width} - ${headsize}))
        local padding=$(string_dupch ${padding_width} " ")
        echo "  ${head}${padding}${tail}"
    done
}

# show configure usage
_show_usage() {
echo '
Usage: '"$0"' [<options>...]
Options: [defaults in brackets after descriptions]
Common options:
  --help                  Print this message.
  --version               Only print version information.
  --verbose               Display more information.
  --diagnosis             Display lots of diagnosis information.

  --generator=GENERATOR   Set the project generator. (default: '"${_project_generator}"')
                            - gmake
                            - ninja
  --make=MAKE             Set the make program. (default: '"${_make_program_default}"')
  --ninja=NINJA           Set the Ninja program. (default: '"${_ninja_program_default}"')
  --plat=PLAT             Compile for the given platform. (default: '"${_target_plat_default}"')
                            - msys
                            - cross
                            - bsd
                            - mingw
                            - macosx
                            - linux
  --arch=ARCH             Compile for the given architecture. (default: '"${_target_arch_default}"')
                            - msys: i386 x86_64
                            - cross: i386 x86_64 arm arm64 mips mips64 riscv riscv64 s390x ppc ppc64 sh4
                            - bsd: i386 x86_64
                            - mingw: i386 x86_64 arm arm64
                            - macosx: x86_64 arm64
                            - linux: i386 x86_64 armv7 armv7s arm64-v8a mips mips64 mipsel mips64el
  --mode=MODE             Set the given compilation mode. (default: '"${_target_mode_default}"')
                            - release
                            - debug
  --toolchain=TOOLCHAIN   Set toolchain name.
                            - clang
                            - gcc

  --prefix=PREFIX         Set install files directory in tree rooted at PREFIX. (default: '"${_install_prefix_default}"')
  --bindir=DIR            Set install binaries directory in PREFIX/DIR. (default: '"${_install_bindir_default}"')
  --libdir=DIR            Set install libraries directory in PREFIX/DIR. (default: '"${_install_libdir_default}"')
  --includedir=DIR        Set install includes directory in PREFIX/DIR. (default: '"${_install_includedir_default}"')
  --buildir=DIR           Set build directory. (default: '"${xmake_sh_buildir}"')

Project options:
'"$(_show_options_usage)"'
'
    exit 1
}

# show xmake.sh version
_show_version() {
    echo "xmake.sh v${xmake_sh_version}, A script-only build utility like autotools"
    echo "${xmake_sh_copyright}"
    echo '                         _               _            '
    echo "    __  ___ __  __  __ _| | ______   ___| |__         "
    echo "    \ \/ / |  \/  |/ _  | |/ / __ \ / __| '_  \       "
    echo "     >  <  | \__/ | /_| |   <  ___/_\__ \ | | |       "
    echo "    /_/\_\_|_|  |_|\__ \|_|\_\____(_)___/_| |_|       "
    echo '                                     by ruki, xmake.io'
    echo '                                                      '
    echo '   👉  Manual: https://xmake.io/#/getting_started     '
    echo '   🙏  Donate: https://xmake.io/#/sponsor             '
    echo '                                                      '
    exit 2
}

# --foo=yes => foo
_parse_argument_name() {
    _ret=$(echo "${1#*--}" | sed "s/${2-=[^=]*}$//")
}

# --foo=yes => yes
_parse_argument_value() {
    _ret=$(echo "$1" | sed "s/^${2-[^=]*=}//")
}

# parse input arguments
_handle_option() {
    _parse_argument_name ${1}; local name="${_ret}"
    _parse_argument_value ${1}; local value="${_ret}"
    if test_eq "${name}" "help"; then
        _show_usage
        return 0
    elif test_eq "${name}" "version"; then
        _show_version
        return 0
    elif test_eq "${name}" "verbose"; then
        xmake_sh_verbose=true
        return 0
    elif test_eq "${name}" "diagnosis"; then
        xmake_sh_diagnosis=true
        return 0
    elif test_eq "${name}" "plat"; then
        _target_plat=${value}
        return 0
    elif test_eq "${name}" "arch"; then
        _target_arch=${value}
        return 0
    elif test_eq "${name}" "mode"; then
        _target_mode=${value}
        return 0
    elif test_eq "${name}" "toolchain"; then
        _target_toolchain=${value}
        return 0
    elif test_eq "${name}" "generator"; then
        _project_generator=${value}
        return 0
    elif test_eq "${name}" "make"; then
        _make_program=${value}
        return 0
    elif test_eq "${name}" "ninja"; then
        _ninja_program=${value}
        return 0
    elif test_eq "${name}" "prefix"; then
        _install_prefix_default="${value}"
        return 0
    elif test_eq "${name}" "bindir"; then
        _install_bindir_default="${value}"
        return 0
    elif test_eq "${name}" "libdir"; then
        _install_libdir_default="${value}"
        return 0
    elif test_eq "${name}" "includedir"; then
        _install_includedir_default="${value}"
        return 0
    elif test_eq "${name}" "buildir"; then
        xmake_sh_buildir="${value}"
        return 0
    elif _has_option "${name}"; then
        _set_option_value "${name}" "${value}"
        return 0
    fi
    return 1
}
while test $# != 0; do
    if _handle_option ${1}; then
        shift
    else
        raise "Unknown option: $1"
    fi
done

#-----------------------------------------------------------------------------
# detect platform and toolchains
#

# clang toolchain
toolchain "clang"
    set_toolset "as" "clang"
    set_toolset "cc" "clang"
    set_toolset "cxx" "clang" "clang++"
    set_toolset "mm" "clang"
    set_toolset "mxx" "clang" "clang++"
    set_toolset "ld" "clang++" "clang"
    set_toolset "sh" "clang++" "clang"
    set_toolset "ar" "ar"
toolchain_end

# gcc toolchain
toolchain "gcc"
    set_toolset "as" "gcc"
    set_toolset "cc" "gcc"
    set_toolset "cxx" "gcc" "g++"
    set_toolset "mm" "gcc"
    set_toolset "mxx" "gcc" "g++"
    set_toolset "ld" "g++" "gcc"
    set_toolset "sh" "g++" "gcc"
    set_toolset "ar" "ar"
toolchain_end

# check platform
_check_platform() {
    if test "x${_target_plat}" = "x"; then
        _target_plat=${_target_plat_default}
    fi
    if test "x${_target_arch}" = "x"; then
        _target_arch=${_target_arch_default}
    fi
    if test "x${_target_mode}" = "x"; then
        _target_mode=${_target_mode_default}
    fi
    echo "checking for platform ... ${_target_plat}"
    echo "checking for architecture ... ${_target_arch}"
}

# get toolchain compile command for gcc/clang
_toolchain_compcmd_for_gcc_clang() {
    local program="${1}"
    local objectfile="${2}"
    local sourcefile="${3}"
    local flags="${4}"
    _ret="${program} -c ${flags} -o ${objectfile} ${sourcefile}"
}

# get toolchain link command for gcc/clang
_toolchain_linkcmd_for_gcc_clang() {
    local toolkind="${1}"
    local program="${2}"
    local binaryfile="${3}"
    local objectfiles="${4}"
    local flags="${5}"
    if test_eq "${toolkind}" "sh"; then
        flags="-shared -fPIC ${flags}"
    fi
    _ret="${program} -o ${binaryfile} ${objectfiles} ${flags}"
}

# get toolchain link command for ar
_toolchain_linkcmd_for_ar() {
    local toolkind="${1}"
    local program="${2}"
    local binaryfile="${3}"
    local objectfiles="${4}"
    local flags="${5}"
    _ret="${program} ${flags} ${binaryfile} ${objectfiles}"
}

# get toolchain compile command
_toolchain_compcmd() {
    local sourcekind="${1}"
    local objectfile="${2}"
    local sourcefile="${3}"
    local flags="${4}"
    _get_toolchain_toolset "${_target_toolchain}" "${sourcekind}"; local program="${_ret}"
    path_toolname "${program}"; local toolname="${_ret}"
    local compcmd=""
    case "${toolname}" in
        gcc) _toolchain_compcmd_for_gcc_clang "${program}" "${objectfile}" "${sourcefile}" "${flags}"; compcmd="${_ret}";;
        gxx) _toolchain_compcmd_for_gcc_clang "${program}" "${objectfile}" "${sourcefile}" "${flags}"; compcmd="${_ret}";;
        clang) _toolchain_compcmd_for_gcc_clang "${program}" "${objectfile}" "${sourcefile}" "${flags}"; compcmd="${_ret}";;
        clangxx) _toolchain_compcmd_for_gcc_clang "${program}" "${objectfile}" "${sourcefile}" "${flags}"; compcmd="${_ret}";;
        *) raise "unknown toolname(${toolname})!" ;;
    esac
    _ret="${compcmd}"
}

# get toolchain link command
_toolchain_linkcmd() {
    local toolkind="${1}"
    local binaryfile="${2}"
    local objectfiles="${3}"
    local flags="${4}"
    _get_toolchain_toolset "${_target_toolchain}" "${toolkind}"; local program="${_ret}"
    path_toolname "${program}"; local toolname="${_ret}"
    local linkcmd=""
    case "${toolname}" in
        gcc) _toolchain_linkcmd_for_gcc_clang "${toolkind}" "${program}" "${binaryfile}" "${objectfiles}" "${flags}"; linkcmd="${_ret}";;
        gxx) _toolchain_linkcmd_for_gcc_clang "${toolkind}" "${program}" "${binaryfile}" "${objectfiles}" "${flags}"; linkcmd="${_ret}";;
        clang) _toolchain_linkcmd_for_gcc_clang "${toolkind}" "${program}" "${binaryfile}" "${objectfiles}" "${flags}"; compcmd="${_ret}";;
        clangxx) _toolchain_linkcmd_for_gcc_clang "${toolkind}" "${program}" "${binaryfile}" "${objectfiles}" "${flags}"; linkcmd="${_ret}";;
        ar) _toolchain_linkcmd_for_ar "${toolkind}" "${program}" "${binaryfile}" "${objectfiles}" "${flags}"; linkcmd="${_ret}";;
        *) raise "unknown toolname(${toolname})!" ;;
    esac
    _ret="${linkcmd}"
}

# try make
_toolchain_try_make() {
    local program=${1}
    if _os_runv "${program}" "--version"; then
        return 0
    fi
    return 1
}

# try ninja
_toolchain_try_ninja() {
    local program=${1}
    if _os_runv "${program}" "--version"; then
        return 0
    fi
    return 1
}

# try gcc
_toolchain_try_gcc() {
    if test "x${_toolchain_try_gcc_result}" = "xok"; then
        return 0
    elif test "x${_toolchain_try_gcc_result}" = "xno"; then
        return 1
    fi

    local kind=${1}
    local program=${2}
    if _os_runv "${program}" "--version"; then
        _toolchain_try_gcc_result="ok"
        return 0
    fi
    _toolchain_try_gcc_result="no"
    return 1
}

# try g++
_toolchain_try_gxx() {
    if test "x${_toolchain_try_gxx_result}" = "xok"; then
        return 0
    elif test "x${_toolchain_try_gxx_result}" = "xno"; then
        return 1
    fi

    local kind=${1}
    local program=${2}
    if _os_runv "${program}" "--version"; then
        _toolchain_try_gxx_result="ok"
        return 0
    fi
    _toolchain_try_gxx_result="no"
    return 1
}

# try clang
_toolchain_try_clang() {
    if test "x${_toolchain_try_clang_result}" = "xok"; then
        return 0
    elif test "x${_toolchain_try_clang_result}" = "xno"; then
        return 1
    fi

    local kind=${1}
    local program=${2}
    if _os_runv "${program}" "--version"; then
        _toolchain_try_clang_result="ok"
        return 0
    fi
    _toolchain_try_clang_result="no"
    return 1
}

# try clang++
_toolchain_try_clangxx() {
    if test "x${_toolchain_try_clangxx_result}" = "xok"; then
        return 0
    elif test "x${_toolchain_try_clangxx_result}" = "xno"; then
        return 1
    fi

    local kind=${1}
    local program=${2}
    if _os_runv "${program}" "--version"; then
        _toolchain_try_clangxx_result="ok"
        return 0
    fi
    _toolchain_try_clangxx_result="no"
    return 1
}

# TODO try ar
_toolchain_try_ar() {
    local kind=${1}
    local program=${2}

    # generate the source file
    _os_tmpfile
    local tmpfile="${_ret}"
    local objectfile="${tmpfile}.o"
    local libraryfile="${tmpfile}.a"
    echo "" > "${objectfile}"

    # try linking it
    local ok=false
    if _os_runv "${program}" "-cr" "${libraryfile}" "${objectfile}"; then
        ok=true
    fi

    # remove files
    _os_tryrm "${objectfile}"
    _os_tryrm "${libraryfile}"
    if ${ok}; then
        return 0
    fi
    return 1
}

# try program
_toolchain_try_program() {
    local toolchain=${1}
    local kind=${2}
    local program=${3}
    local ok=false
    path_toolname "${program}"; local toolname="${_ret}"
    case "${toolname}" in
        gcc) _toolchain_try_gcc "${kind}" "${program}" && ok=true;;
        gxx) _toolchain_try_gxx "${kind}" "${program}" && ok=true;;
        clang) _toolchain_try_clang "${kind}" "${program}" && ok=true;;
        clangxx) _toolchain_try_clangxx "${kind}" "${program}" && ok=true;;
        ar) _toolchain_try_ar "${kind}" "${program}" && ok=true;;
        *) raise "unknown toolname(${toolname})!" ;;
    esac
    if ${ok}; then
        vprint "checking for ${program} ... ok"
        return 0
    fi
    vprint "checking for ${program} ... no"
    return 1
}

# try toolset
_toolchain_try_toolset() {
    local toolchain=${1}
    local kind=${2}
    local description=${3}
    local indices="0 1 2 3 4 5"
    for idx in ${indices}; do
        local key="${kind}"
        if test_nq "${idx}" "0"; then
            key="${key}_${idx}"
        fi
        _get_toolchain_toolset "${toolchain}" "${key}"; local program="${_ret}"
        if _toolchain_try_program "${toolchain}" "${kind}" "${program}"; then
            _set_toolchain_toolset "${toolchain}" "${kind}" "${program}"
            echo "checking for the ${description} (${kind}) ... ${program}"
            return 0
        fi
    done
    return 1
}

# try toolchain
_toolchain_try() {
    local toolchain=${1}
    vprint "checking for $toolchain toolchain ..."
    if _toolchain_try_toolset "${toolchain}" "cc" "c compiler" &&
       _toolchain_try_toolset "${toolchain}" "cxx" "c++ compiler" &&
       _toolchain_try_toolset "${toolchain}" "as" "assembler" &&
       _toolchain_try_toolset "${toolchain}" "mm" "objc compiler" &&
       _toolchain_try_toolset "${toolchain}" "mxx" "objc++ compiler" &&
       _toolchain_try_toolset "${toolchain}" "ld" "linker" &&
       _toolchain_try_toolset "${toolchain}" "ar" "static library archiver" &&
       _toolchain_try_toolset "${toolchain}" "sh" "shared library linker"; then
        return 0
    fi
    return 1
}

# detect make
_toolchain_detect_make() {
    if test "x${_make_program}" = "x"; then
        _make_program=${_make_program_default}
    fi
    if _toolchain_try_make "${_make_program}"; then
        echo "checking for make ... ok"
    else
        echo "checking for make ... no"
        raise "make not found!"
    fi
}

# detect ninja
_toolchain_detect_ninja() {
    if test "x${_ninja_program}" = "x"; then
        _ninja_program=${_ninja_program_default}
    fi
    if _toolchain_try_ninja "${_ninja_program}"; then
        echo "checking for ninja ... ok"
    else
        echo "checking for ninja ... no"
        raise "ninja not found!"
    fi
}

# detect build backend
_toolchain_detect_backend() {
    if test "x${_project_generator}" = "xgmake"; then
        _toolchain_detect_make
    elif test "x${_project_generator}" = "xninja"; then
        _toolchain_detect_ninja
    fi
}

# detect toolchain
_toolchain_detect() {
    # detect build backend
    _toolchain_detect_backend

    # detect toolchains
    local toolchains="${1}"
    if test "x${toolchains}" = "x"; then
        if is_plat "macosx"; then
            toolchains="clang gcc"
        else
            toolchains="gcc clang"
        fi
    fi
    for toolchain in ${toolchains}; do
        if _toolchain_try "$toolchain"; then
            _target_toolchain=${toolchain}
            break
        fi
    done
}

# check toolchain
_check_toolchain() {
    local toolchain=${_target_toolchain}
    _target_toolchain=""
    _toolchain_detect ${toolchain}

    if test "x${_target_toolchain}" != "x"; then
        echo "checking for toolchain ... ${_target_toolchain}"
    else
        echo "checking for toolchain ... no"
        raise "toolchain not found!"
    fi
}

# get function code
#
# sigsetjmp
# sigsetjmp((void*)0, 0)
#
_get_funccode() {
    local func="${1}"
    local code=""
    if string_contains "${func}" "("; then
        code="${func}"
    else
        code="volatile void* p${func} = (void*)&${func};"
    fi
    _ret="${code}"
}

# generate cxsnippets source code
_generate_cxsnippets_sourcecode() {
    local funcs="${1}"
    local includes="${2}"
    local types="${3}"
    local snippets="${4}"

    local snippet_includes=""
    for include in $includes; do
        snippet_includes="${snippet_includes}#include \"${include}\"\n"
    done

    local snippet_types=""
    for type in $types; do
        string_replace "${type}" '[^a-zA-Z]' "_"; local typevar="${_ret}"
        snippet_types="${snippet_types}typedef ${type} __type_${typevar};\n"
    done

    local snippet_funcs=""
    for func in $funcs; do
        _get_funccode "${func}"; func="${_ret}"
        snippet_funcs="${snippet_funcs}${func}\n    "
    done

    local snippets_code=""
    if test_nz "${snippet_includes}"; then
        snippets_code="${snippets_code}${snippet_includes}\n"
    fi
    if test_nz "${snippet_types}"; then
        snippets_code="${snippets_code}${snippet_types}\n"
    fi
    if test_nz "${snippets}"; then
        snippets_code="${snippets_code}${snippets}\n"
    fi

    _ret='
'"${snippets_code}"'int main(int argc, char** argv) {
    '"${snippet_funcs}"'
    return 0;
}'
}

# check cxsnippets
_check_cxsnippets() {
    local name="${1}"
    local kind="${2}"
    _get_option_item "${name}" "${kind}funcs"; local funcs="${_ret}"
    _get_option_item "${name}" "${kind}includes"; local includes="${_ret}"
    _get_option_item "${name}" "${kind}types"; local types="${_ret}"
    _get_option_item "${name}" "${kind}snippets"; local snippets="${_ret}"
    _get_option_item "${name}" "links"; local links="${_ret}"
    _get_option_item "${name}" "syslinks"; local syslinks="${_ret}"
    if test_z "${funcs}" && test_z "${includes}" &&
       test_z "${types}" && test_z "${snippets}"; then
        return 0
    fi
    if test_nz "${syslinks}"; then
        links="${links} ${syslinks}"
    fi

    # get c/c++ extension
    local extension=".c"
    local sourcekind="cc"
    if test_eq "${kind}" "cxx"; then
        extension=".cpp"
        sourcekind="cxx"
    fi

    # generate source code
    _generate_cxsnippets_sourcecode "${funcs}" "${includes}" "${types}" "${snippets}"; local sourcecode="${_ret}"
    dprint "${sourcecode}"

    # generate the source file
    _os_tmpfile
    local tmpfile="${_ret}"
    local sourcefile="${tmpfile}${extension}"
    local objectfile="${tmpfile}.o"
    local binaryfile="${tmpfile}.bin"
    print "${sourcecode}" > "${sourcefile}"

    # try compiling it
    local ok=false
    if ! ${ok}; then
        local compflags=""
        _get_toolchain_toolset "${_target_toolchain}" "${sourcekind}"; local program="${_ret}"
        path_toolname "${program}"; local toolname="${_ret}"
        local itemnames="languages warnings optimizes defines undefines"
        for itemname in ${itemnames}; do
            _get_option_abstract_flags "${name}" "${sourcekind}" "${toolname}" "${itemname}"; local flags="${_ret}"
            if test_nz "${flags}"; then
                _split_flags "${flags}"; flags="${_ret}"
                compflags="${compflags} ${flags}"
            fi
        done
        local flagnames="cxflags"
        if test_eq "${sourcekind}" "cxx"; then
            flagnames="${flagnames} cxxflags"
        else
            flagnames="${flagnames} cflags"
        fi
        for flagname in $flagnames; do
            _get_option_item "${name}" "${flagname}"; local flags="${_ret}"
            if test_nz "${flags}"; then
                compflags="${compflags} ${flags}"
            fi
        done
        _toolchain_compcmd "${sourcekind}" "${objectfile}" "${sourcefile}" "${compflags}"; local compcmd="${_ret}"
        if ${xmake_sh_diagnosis}; then
            print "> ${compcmd}"
        fi
        if _os_runv ${compcmd}; then
            ok=true
        fi
    fi

    # try linking it
    if ${ok} && test_nz "${links}"; then
        local toolkind="ld"
        _get_toolchain_toolset "${_target_toolchain}" "${toolkind}"; local program="${_ret}"
        path_toolname "${program}"; local toolname="${_ret}"
        local itemnames="linkdirs links syslinks"
        local linkflags=""
        for itemname in ${itemnames}; do
            _get_option_abstract_flags "${name}" "${toolkind}" "${toolname}" "${itemname}"; local flags="${_ret}"
            if test_nz "${flags}"; then
                _split_flags "${flags}"; flags="${_ret}"
                linkflags="${linkflags} ${flags}"
            fi
        done
        _get_option_item "${name}" "ldflags"; local flags="${_ret}"
        if test_nz "${flags}"; then
            linkflags="${linkflags} ${flags}"
        fi
        _toolchain_linkcmd "${toolkind}" "${binaryfile}" "${objectfile}" "${linkflags}"; local linkcmd="${_ret}"
        if ${xmake_sh_diagnosis}; then
            print "> ${linkcmd}"
        fi
        if _os_runv ${linkcmd}; then
            ok=true
        else
            ok=false
        fi
    fi

    # trace
    if ${xmake_sh_verbose} || ${xmake_sh_diagnosis}; then
        if test_nz "${includes}"; then
            print "> checking for ${kind} includes(${includes})"
        fi
        if test_nz "${types}"; then
            print "> checking for ${kind} types(${types})"
        fi
        if test_nz "${funcs}"; then
            print "> checking for ${kind} funcs(${funcs})"
        fi
        if test_nz "${links}"; then
            print "> checking for ${kind} links(${links})"
        fi
    fi

    # remove files
    _os_tryrm "${sourcefile}"
    _os_tryrm "${objectfile}"
    _os_tryrm "${binaryfile}"
    if ${ok}; then
        return 0
    fi
    return 1
}

# check csnippets
_check_csnippets() {
    local name="${1}"
    if _check_cxsnippets "${name}" "c"; then
        return 0
    fi
    return 1
}

# check cxxsnippets
_check_cxxsnippets() {
    local name="${1}"
    if _check_cxsnippets "${name}" "cxx"; then
        return 0
    fi
    return 1
}

# check option
_check_option() {
    local name="${1}"
    if _check_csnippets "${name}" && _check_cxxsnippets "${name}"; then
        return 0
    fi
    return 1
}

# check options
_check_options() {
    _get_options_for_checking; local options="${_ret}"
    for name in $options; do
        if _check_option "$name"; then
            echo "checking for ${name} .. ok"
            _set_option_value "${name}" true
        else
            echo "checking for ${name} .. no"
            _set_option_value "${name}" false
        fi
    done
}

# check all
_check_all() {
    _check_platform
    _check_toolchain
    _check_options
}
_check_all

#-----------------------------------------------------------------------------
# init builtin variables, e.g. add_headerfiles "${buildir}/config.h"
#
projectdir="${xmake_sh_projectdir}"
if path_is_absolute "${xmake_sh_buildir}"; then
    buildir="${xmake_sh_buildir}"
else
    buildir="${xmake_sh_projectdir}/${xmake_sh_buildir}"
fi
plat="${_target_plat}"
arch="${_target_arch}"
mode="${_target_mode}"

#-----------------------------------------------------------------------------
# load project targets
#

# load targets
_load_targets() {
    _loading_options=false
    _loading_toolchains=false
    _loading_targets=true
    _xmake_sh_option_current=""
    _xmake_sh_target_current=""
    _xmake_sh_toolchain_current=""
    local file=${xmake_sh_projectdir}/xmake.sh
    if test -f "${file}"; then
        includes "${file}"
    else
        # include all xmake.sh files in next sub-directories
        _os_find "${xmake_sh_projectdir}" "xmake.sh" 2; local files="${_ret}"
        for file in ${files}; do
            includes "${file}"
        done
    fi
}
_load_targets

# get toolset kinds for all targets
# e.g. cc cxx as mm mxx ld sh ar
_get_targets_toolkinds() {
    if test_z "${_targets_toolkinds_dedup}"; then
        _dedup "${_targets_toolkinds}"; _targets_toolkinds_dedup="${_ret}"
    fi
    _ret="${_targets_toolkinds_dedup}"
}

#-----------------------------------------------------------------------------
# generate configfiles
#

# vprint config variable in `${name}`
_vprint_configvar_value() {
    local name="${1}"
    local value="${2}"
    vprint "  > replace ${name} -> ${value}"
}

# vprint config variable in `${define name}`
_vprint_configvar_define() {
    local name="${1}"
    local value="${2}"
    if test_z "${value}"; then
        vprint "  > replace ${name} -> /* #undef ${name} */"
    elif test_eq "${value}" "1" || test_eq "${value}" "true"; then
        vprint "  > replace ${name} -> #define ${name} 1"
    elif test_eq "${value}" "0" || test_eq "${value}" "false"; then
        vprint "  > replace ${name} -> /*#define ${name} 0*/"
    else
        vprint "  > replace ${name} -> #define ${name} ${value}"
    fi
}

# replace config variable in `${define name}`
_replace_configvar_define() {
    local name="${1}"
    local value="${2}"
    if test_z "${value}"; then
        _ret="s/\${define ${name}}/\/*#undef ${name}*\//g"
    elif test_eq "${value}" "1" || test_eq "${value}" "true"; then
        _ret="s/\${define ${name}}/#define ${name} 1/g"
    elif test_eq "${value}" "0" || test_eq "${value}" "false"; then
        _ret="s/\${define ${name}}/\/*#define ${name} 0*\//g"
    else
        _ret="s/\${define ${name}}/#define ${name} ${value}/g"
    fi
}

# replace config variable in `${name}`
_replace_configvar_value() {
    local name="${1}"
    local value="${2}"
    _ret="s/\${${name}}/${value}/g"
}

# generate configfile for the given target
_generate_configfile() {
    local target="${1}"
    local configfile_in="${2}"
    _get_target_item "${target}" "configdir"; local configdir="${_ret}"
    if test_z "${configdir}"; then
        path_directory configfile_in; configdir="${_ret}"
    fi
    if ! test -d "${configdir}"; then
        mkdir -p "${configdir}"
    fi
    path_basename "${configfile_in}"; local filename="${_ret}"
    local configfile="${configdir}/${filename}"
    echo "generating ${configfile} .."

    # replace builtin variables
    local patterns=""
    local target_os=""
    if is_plat "mingw"; then
        target_os="windows"
    else
        target_os="${_target_plat}"
    fi
    string_toupper ${target_os}; target_os="${_ret}"
    _vprint_configvar_value "OS" "${target_os}"
    _replace_configvar_value "OS" "${target_os}"; patterns="${_ret};${patterns}"

    # replace version
    _get_target_item "${target}" "version"; local version="${_ret}"
    _get_target_item "${target}" "version_build"; local version_build="${_ret}"
    string_split "${version}" "."
    local version_major="${_ret}"
    local version_minor="${_ret2}"
    local version_alter="${_ret3}"
    if test_nz "${version}"; then
        _vprint_configvar_value "VERSION" "${version}"
        _replace_configvar_value "VERSION" "${version}"; patterns="${_ret};${patterns}"
    fi
    if test_nz "${version_major}"; then
        _vprint_configvar_value "VERSION_MAJOR" "${version_major}"
        _replace_configvar_value "VERSION_MAJOR" "${version_major}"; patterns="${_ret};${patterns}"
    fi
    if test_nz "${version_minor}"; then
        _vprint_configvar_value "VERSION_MINOR" "${version_minor}"
        _replace_configvar_value "VERSION_MINOR" "${version_minor}"; patterns="${_ret};${patterns}"
    fi
    if test_nz "${version_alter}"; then
        _vprint_configvar_value "VERSION_ALTER" "${version_alter}"
        _replace_configvar_value "VERSION_ALTER" "${version_alter}"; patterns="${_ret};${patterns}"
    fi
    if test_nz "${version_build}"; then
        _os_date "${version_build}"; version_build="${_ret}"
        _vprint_configvar_value "VERSION_BUILD" "${version_build}"
        _replace_configvar_value "VERSION_BUILD" "${version_build}"; patterns="${_ret};${patterns}"
    fi

    # replace git variables
    local content=$(cat "${configfile_in}")
    if string_contains "${content}" "GIT_"; then
        _os_iorunv "git" "describe" "--tags"; local git_tag="${_ret}"
        if test_nz "${git_tag}"; then
            _vprint_configvar_value "GIT_TAG" "${git_tag}"
            _replace_configvar_value "GIT_TAG" "${git_tag}"; patterns="${_ret};${patterns}"
        fi
        _os_iorunv "git" "describe" "--tags" "--long"; local git_tag_long="${_ret}"
        if test_nz "${git_tag_long}"; then
            _vprint_configvar_value "GIT_TAG_LONG" "${git_tag_long}"
            _replace_configvar_value "GIT_TAG_LONG" "${git_tag_long}"; patterns="${_ret};${patterns}"
        fi
        _os_iorunv "git" "rev-parse" "--abbrev-ref" "HEAD"; local git_branch="${_ret}"
        if test_nz "${git_branch}"; then
            _vprint_configvar_value "GIT_BRANCH" "${git_branch}"
            _replace_configvar_value "GIT_BRANCH" "${git_branch}"; patterns="${_ret};${patterns}"
        fi
        _os_iorunv "git" "rev-parse" "--short" "HEAD"; local git_commit="${_ret}"
        if test_nz "${git_commit}"; then
            _vprint_configvar_value "GIT_COMMIT" "${git_commit}"
            _replace_configvar_value "GIT_COMMIT" "${git_commit}"; patterns="${_ret};${patterns}"
        fi
        _os_iorunv "git" "rev-parse" "HEAD"; local git_commit_long="${_ret}"
        if test_nz "${git_commit_long}"; then
            _vprint_configvar_value "GIT_COMMIT_LONG" "${git_commit_long}"
            _replace_configvar_value "GIT_COMMIT_LONG" "${git_commit_long}"; patterns="${_ret};${patterns}"
        fi
        _os_iorunv "log" "-1" "--date=format:%Y%m%d%H%M%S" "--format=%ad"; local git_commit_date="${_ret}"
        if test_nz "${git_commit_date}"; then
            _vprint_configvar_value "GIT_COMMIT_DATE" "${git_commit_date}"
            _replace_configvar_value "GIT_COMMIT_DATE" "${git_commit_date}"; patterns="${_ret};${patterns}"
        fi
    fi

    # replace configvars in target
    local count=0
    local configfile_dst="${configfile}"
    _os_tmpfile; local tmpfile="${_ret}"
    cp "${configfile_in}" "${tmpfile}"
    _get_target_item "${target}" "configvars"; local configvars="${_ret}"
    for name in ${configvars}; do
        _get_target_item "${target}" "configvar_${name}"; local value="${_ret}"
        _vprint_configvar_define "${name}" "${value}"
        _vprint_configvar_value "${name}" "${value}"
        _replace_configvar_define "${name}" "${value}"; patterns="${_ret};${patterns}"
        _replace_configvar_value "${name}" "${value}"; patterns="${_ret};${patterns}"
        count=$((count + 1))

        # do replace
        if test_eq "$count" "10"; then
            _io_replace_file "${tmpfile}" "${configfile}" "${patterns}"
            local swapfile="${tmpfile}"
            tmpfile="${configfile}"
            configfile="${swapfile}"
            patterns=""
            count=0
        fi
    done

    # do replace (left)
    if test_nz "${patterns}"; then
        _io_replace_file "${tmpfile}" "${configfile}" "${patterns}"
        local swapfile="${tmpfile}"
        tmpfile="${configfile}"
        configfile="${swapfile}"
        patterns=""
        count=0
    fi

    # replace fallback
    patterns='s/${define \(.*\)}/\/*#undef \1*\//g;'
    _io_replace_file "${tmpfile}" "${configfile}" "${patterns}"
    if test_nq "${configfile}" "${configfile_dst}"; then
        cp "${configfile}" "${configfile_dst}"
    fi
    echo "${configfile_dst} is generated!"
}

# generate configfiles
_generate_configfiles() {
    for target in ${_xmake_sh_targets}; do
        _get_target_item "${target}" "configfiles"; local configfiles="${_ret}"
        for configfile in ${configfiles}; do
            _generate_configfile "${target}" "${configfile}"
        done
    done
}
_generate_configfiles

#-----------------------------------------------------------------------------
# generate gmake file
#

_gmake_begin() {
    echo "generating makefile .."
}

_gmake_add_header() {
    echo "# this is the build file for this project
# it is autogenerated by the xmake.sh build system.
# do not edit by hand.
" > "${xmake_sh_projectdir}/Makefile"
}

_gmake_add_switches() {
    echo "ifneq (\$(VERBOSE),1)" >> "${xmake_sh_projectdir}/Makefile"
    echo "V=@" >> "${xmake_sh_projectdir}/Makefile"
    echo "endif" >> "${xmake_sh_projectdir}/Makefile"
    echo "" >> "${xmake_sh_projectdir}/Makefile"
}

_gmake_add_flags() {
    _get_targets_toolkinds; local kinds="${_ret}"
    for target in ${_xmake_sh_targets}; do
        for kind in ${kinds}; do
            _get_target_flags "${target}" "${kind}"; local flags="${_ret}"
            _get_flagname "${kind}"; local flagname="${_ret}"
            local key="${target}_${flagname}"
            echo "${key}=${flags}" >> "${xmake_sh_projectdir}/Makefile"
        done
        echo "" >> "${xmake_sh_projectdir}/Makefile"
    done
}

_gmake_add_toolchains() {
    _get_targets_toolkinds; local kinds="${_ret}"
    for kind in ${kinds}; do
        _get_toolchain_toolset "${_target_toolchain}" "${kind}"; local program="${_ret}"
        local key="${kind}"
        echo "${key}=${program}" >> "${xmake_sh_projectdir}/Makefile"
    done
    echo "" >> "${xmake_sh_projectdir}/Makefile"
}

_gmake_add_build_object_for_gcc_clang() {
    local kind="${1}"
    local sourcefile="${2}"
    local objectfile="${3}"
    local flagname="${4}"
    path_directory "${objectfile}"; local objectdir="${_ret}"
    print "\t@mkdir -p ${objectdir}" >> "${xmake_sh_projectdir}/Makefile"
    print "\t\$(V)\$(${kind}) -c \$(${flagname}) -o ${objectfile} ${sourcefile}" >> "${xmake_sh_projectdir}/Makefile"
}

_gmake_add_build_object() {
    local target=${1}
    local sourcefile="${2}"
    local objectfile="${3}"
    path_sourcekind "${sourcefile}"; local sourcekind="${_ret}"
    _get_toolchain_toolset "${_target_toolchain}" "${sourcekind}"; local program="${_ret}"
    path_toolname "${program}"; local toolname="${_ret}"
    _get_flagname "${sourcekind}"; local flagname="${_ret}"
    flagname="${target}_${flagname}"
    echo "${objectfile}: ${sourcefile}" >> "${xmake_sh_projectdir}/Makefile"
    print "\t@echo compiling.${_target_mode} ${sourcefile}" >> "${xmake_sh_projectdir}/Makefile"
    case "${toolname}" in
        gcc) _gmake_add_build_object_for_gcc_clang "${sourcekind}" "${sourcefile}" "${objectfile}" "${flagname}";;
        gxx) _gmake_add_build_object_for_gcc_clang "${sourcekind}" "${sourcefile}" "${objectfile}" "${flagname}";;
        clang) _gmake_add_build_object_for_gcc_clang "${sourcekind}" "${sourcefile}" "${objectfile}" "${flagname}";;
        clangxx) _gmake_add_build_object_for_gcc_clang "${sourcekind}" "${sourcefile}" "${objectfile}" "${flagname}";;
        *) raise "unknown toolname(${toolname})!" ;;
    esac
    echo "" >> "${xmake_sh_projectdir}/Makefile"
}

_gmake_add_build_objects() {
    local target=${1}
    _get_target_sourcefiles "${target}"; local sourcefiles="${_ret}"
    for sourcefile in ${sourcefiles}; do
        _get_target_objectfile "${target}" "${sourcefile}"; local objectfile="${_ret}"
        _gmake_add_build_object "${target}" "${sourcefile}" "${objectfile}"
    done
}

_gmake_add_build_target_for_gcc_clang() {
    local kind="${1}"
    local targetfile="${2}"
    local objectfiles="${3}"
    local flagname="${4}"
    path_directory "${targetfile}"; local targetdir="${_ret}"
    print "\t@mkdir -p ${targetdir}" >> "${xmake_sh_projectdir}/Makefile"
    print "\t\$(V)\$(${kind}) -o ${targetfile} ${objectfiles} \$(${flagname})" >> "${xmake_sh_projectdir}/Makefile"
}

_gmake_add_build_target_for_ar() {
    local kind="${1}"
    local targetfile="${2}"
    local objectfiles="${3}"
    local flagname="${4}"
    path_directory "${targetfile}"; local targetdir="${_ret}"
    print "\t@mkdir -p ${targetdir}" >> "${xmake_sh_projectdir}/Makefile"
    print "\t\$(V)\$(${kind}) \$(${flagname}) ${flags} ${targetfile} ${objectfiles}" >> "${xmake_sh_projectdir}/Makefile"
}

_gmake_add_build_target() {
    local target=${1}
    _get_targetdir "${target}"; local targetdir="${_ret}"
    _get_target_file "${target}"; local targetfile="${_ret}"
    _get_target_item "${target}" "deps"; local deps="${_ret}"
    _get_target_objectfiles "${target}"; local objectfiles="${_ret}"

    # get linker
    _get_target_item "${target}" "kind"; local targetkind="${_ret}"
    local toolkind=""
    case "${targetkind}" in
        binary) toolkind="ld";;
        static) toolkind="ar";;
        shared) toolkind="sh";;
        *) raise "unknown targetkind(${targetkind})!" ;;
    esac
    _get_toolchain_toolset "${_target_toolchain}" "${toolkind}"; local program="${_ret}"
    path_toolname "${program}"; local toolname="${_ret}"

    # get linker flags
    _get_flagname "${toolkind}"; local flagname="${_ret}"
    flagname="${target}_${flagname}"

    # link target
    echo "${target}: ${targetfile}" >> "${xmake_sh_projectdir}/Makefile"
    echo "${targetfile}: ${deps}${objectfiles}" >> "${xmake_sh_projectdir}/Makefile"
    print "\t@echo linking.${_target_mode} ${targetfile}" >> "${xmake_sh_projectdir}/Makefile"
    case "${toolname}" in
        gcc) _gmake_add_build_target_for_gcc_clang "${toolkind}" "${targetfile}" "${objectfiles}" "${flagname}";;
        gxx) _gmake_add_build_target_for_gcc_clang "${toolkind}" "${targetfile}" "${objectfiles}" "${flagname}";;
        clang) _gmake_add_build_target_for_gcc_clang "${toolkind}" "${targetfile}" "${objectfiles}" "${flagname}";;
        clangxx) _gmake_add_build_target_for_gcc_clang "${toolkind}" "${targetfile}" "${objectfiles}" "${flagname}";;
        ar) _gmake_add_build_target_for_ar "${toolkind}" "${targetfile}" "${objectfiles}" "${flagname}";;
        *) raise "unknown toolname(${toolname})!" ;;
    esac
    echo "" >> "${xmake_sh_projectdir}/Makefile"

    # build objects
    _gmake_add_build_objects "${target}"
}

_gmake_add_build_targets() {
    local defaults=""
    for target in ${_xmake_sh_targets}; do
        if _is_target_default "${target}"; then
            defaults="${defaults} ${target}"
        fi
    done
    echo "default:${defaults}" >> "${xmake_sh_projectdir}/Makefile"
    echo "all:${_xmake_sh_targets}" >> "${xmake_sh_projectdir}/Makefile"
    echo ".PHONY: default all" >> "${xmake_sh_projectdir}/Makefile"
    echo "" >> "${xmake_sh_projectdir}/Makefile"
    for target in ${_xmake_sh_targets}; do
        _gmake_add_build_target "${target}"
    done
}

_gmake_add_build() {
    _gmake_add_build_targets
}

_gmake_add_run_target() {
    local target=${1}
    _get_target_file "${target}"; local targetfile="${_ret}"
    print "\t@${targetfile}" >> "${xmake_sh_projectdir}/Makefile"
}

_gmake_add_run_targets() {
    local targets=""
    for target in ${_xmake_sh_targets}; do
        _get_target_item "${target}" "kind"; local kind="${_ret}"
        if test "x${kind}" = "xbinary"; then
            if _is_target_default "${target}"; then
                targets="${targets} ${target}"
            fi
        fi
    done
    echo "run:${targets}" >> "${xmake_sh_projectdir}/Makefile"
    for target in ${targets}; do
        _gmake_add_run_target "${target}"
    done
    echo "" >> "${xmake_sh_projectdir}/Makefile"
}

_gmake_add_run() {
    _gmake_add_run_targets
}

_gmake_add_clean_target() {
    local target=${1}
    _get_target_file "${target}"; local targetfile="${_ret}"
    _get_target_objectfiles "${target}"; local objectfiles="${_ret}"
    print "\t@rm ${targetfile}" >> "${xmake_sh_projectdir}/Makefile"
    for objectfile in ${objectfiles}; do
        print "\t@rm ${objectfile}" >> "${xmake_sh_projectdir}/Makefile"
    done
}

_gmake_add_clean_targets() {
    local targets=""
    for target in ${_xmake_sh_targets}; do
        if _is_target_default "${target}"; then
            targets="${targets} ${target}"
        fi
    done
    echo "clean:${targets}" >> "${xmake_sh_projectdir}/Makefile"
    for target in ${targets}; do
        _gmake_add_clean_target "${target}"
    done
    echo "" >> "${xmake_sh_projectdir}/Makefile"
}

_gmake_add_clean() {
    _gmake_add_clean_targets
}

_gmake_add_install_target() {
    local target=${1}
    _get_target_file "${target}"; local targetfile="${_ret}"
    path_filename "${targetfile}"; local filename="${_ret}"
    _get_target_item "${target}" "installdir"; local installdir="${_ret}"
    if test_z "${installdir}"; then
        installdir=${_install_prefix_default}
    fi

    # install target file
    _get_target_item "${target}" "kind"; local targetkind="${_ret}"
    if test_eq "${targetkind}" "binary"; then
        print "\t@mkdir -p ${installdir}/${_install_bindir_default}" >> "${xmake_sh_projectdir}/Makefile"
        print "\t@cp -p ${targetfile} ${installdir}/${_install_bindir_default}/${filename}" >> "${xmake_sh_projectdir}/Makefile"
    elif test_eq "${targetkind}" "static" || test_eq "${targetkind}" "shared"; then
        print "\t@mkdir -p ${installdir}/${_install_libdir_default}" >> "${xmake_sh_projectdir}/Makefile"
        print "\t@cp -p ${targetfile} ${installdir}/${_install_libdir_default}/${filename}" >> "${xmake_sh_projectdir}/Makefile"
    fi

    # install header files
    _get_target_item "${target}" "headerfiles"; local headerfiles="${_ret}"
    if test_nz "${headerfiles}"; then
        local includedir="${installdir}/${_install_includedir_default}"
        for srcheaderfile in ${headerfiles}; do
            string_split "${srcheaderfile}" ":"
            local srcheaderfile="${_ret}"
            local rootdir="${_ret2}"
            local prefixdir="${_ret3}"
            path_filename "${srcheaderfile}"; local filename="${_ret}"
            local dstheaderdir="${includedir}"
            if test_nz "${prefixdir}"; then
                dstheaderdir="${dstheaderdir}/${prefixdir}"
            fi
            local dstheaderfile="${dstheaderdir}/${filename}"
            if test_nz "${rootdir}"; then
                path_relative "${rootdir}" "${srcheaderfile}"; local subfile="${_ret}"
                dstheaderfile="${dstheaderdir}/${subfile}"
            fi
            path_directory "${dstheaderfile}"; dstheaderdir="${_ret}"
            print "\t@mkdir -p ${dstheaderdir}" >> "${xmake_sh_projectdir}/Makefile"
            print "\t@cp -p ${srcheaderfile} ${dstheaderfile}" >> "${xmake_sh_projectdir}/Makefile"
        done
    fi

    # install user files
    _get_target_item "${target}" "installfiles"; local installfiles="${_ret}"
    if test_nz "${installfiles}"; then
        for srcinstallfile in ${installfiles}; do
            string_split "${srcinstallfile}" ":"
            local srcinstallfile="${_ret}"
            local rootdir="${_ret2}"
            local prefixdir="${_ret3}"
            path_filename "${srcinstallfile}"; local filename="${_ret}"
            local dstinstalldir="${installdir}"
            if test_nz "${prefixdir}"; then
                dstinstalldir="${dstinstalldir}/${prefixdir}"
            fi
            local dstinstallfile="${dstinstalldir}/${filename}"
            if test_nz "${rootdir}"; then
                path_relative "${rootdir}" "${srcinstallfile}"; local subfile="${_ret}"
                dstinstallfile="${dstinstalldir}/${subfile}"
            fi
            path_directory "${dstinstallfile}"; dstinstalldir="${_ret}"
            print "\t@mkdir -p ${dstinstalldir}" >> "${xmake_sh_projectdir}/Makefile"
            print "\t@cp -p ${srcinstallfile} ${dstinstallfile}" >> "${xmake_sh_projectdir}/Makefile"
        done
    fi
}

_gmake_add_install_targets() {
    local targets=""
    for target in ${_xmake_sh_targets}; do
        if _is_target_default "${target}"; then
            targets="${targets} ${target}"
        fi
    done
    echo "install:${targets}" >> "${xmake_sh_projectdir}/Makefile"
    for target in ${targets}; do
        _gmake_add_install_target "${target}"
    done
    echo "" >> "${xmake_sh_projectdir}/Makefile"
}

_gmake_add_install() {
    _gmake_add_install_targets
}

_gmake_done() {
    echo "makefile is generated!"
}

# generate build file for gmake
_generate_for_gmake() {
    _gmake_begin
    _gmake_add_header
    _gmake_add_switches
    _gmake_add_toolchains
    _gmake_add_flags
    _gmake_add_build
    _gmake_add_clean
    _gmake_add_install
    _gmake_add_run
    _gmake_done
}

#-----------------------------------------------------------------------------
# generate ninja file
#

# generate build file for ninja
_generate_for_ninja() {
    raise "Ninja generator has been not supported!"
}

#-----------------------------------------------------------------------------
# generate build file
#

_generate_build_file() {
    if test_eq "${_project_generator}" "gmake"; then
        _generate_for_gmake
    elif test_eq "${_project_generator}" "ninja"; then
        _generate_for_ninja
    else
        raise "unknown generator: ${_project_generator}"
    fi
}
_generate_build_file



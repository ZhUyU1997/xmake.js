#!/usr/bin/env node

// A script-only build utility like autotools
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http:##www.apache.org#licenses#LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//
// Copyright (C) 2022-present, TBOOX Open Source Group.
//
// @author      ruki
//

import fs from "fs-extra"
import path, { dirname, join as path_join } from "path"
import { execaSync } from "execa"
import fastGlob from "fast-glob"
import os from "os"
import tmp from "tmp"
import * as url from "url"
import dayjs from "dayjs"

const __dirname = url.fileURLToPath(new URL(".", import.meta.url))

const xmake_sh_projectdir = path.resolve(__dirname)
let xmake_sh_buildir = "build"
const xmake_sh_version = "1.0.3"
let xmake_sh_verbose = false
let xmake_sh_diagnosis = false
const xmake_sh_copyright = "Copyright (C) 2022-present Ruki Wang, tboox.org, xmake.io."
const xmake_sh_makefile = path.join(xmake_sh_projectdir, "makefile")

let _loading_toolchains = true
let _loading_options = true
let _loading_targets = true

let xmake_sh_scriptdir: string

let _xmake_sh_project_name = ""
let _xmake_sh_options = ""
let _xmake_sh_targets = ""
let _xmake_sh_toolchains = ""
let _xmake_sh_option_current: string
let _xmake_sh_target_current: string
let _xmake_sh_toolchain_current: string

let _install_prefix_default: string
let _install_bindir_default: string
let _install_libdir_default: string
let _install_includedir_default: string

let _target_plat: string = ""
let _target_arch: string = ""
let _target_mode: string = ""
let _target_toolchain: string
let _targets_toolkinds = ""
let _targets_toolkinds_dedup: string
let _make_program: string
let _ninja_program: string

let projectdir: string
let buildir: string

function raise(msg: string) {
    console.error(msg)
    process.exit(1)
}

function vprint(...msg: any[]) {
    if (xmake_sh_verbose) {
        console.log(...msg)
    }
}

function dprint(...msg: any[]) {
    if (xmake_sh_diagnosis) {
        console.log(...msg)
    }
}

function print(...msg: any[]) {
    console.log(...msg)
}

const test_z = (str: string | path.PlatformPath) => {
    if (typeof str === "undefined" || str === "") {
        return true
    }
    return false
}

const test_nz = (str: string) => {
    if (typeof str === "undefined" || str === "") {
        return false
    }
    return true
}

const test_eq = (str1: string, str2: string) => {
    if (str1 === str2) {
        return true
    }
    return false
}

const test_nq = (str1: string, str2: string) => {
    if (str1 !== str2) {
        return true
    }
    return false
}

function string_toupper(str: string) {
    return str.toUpperCase()
}

function string_tolower(str: string) {
    return str.toLowerCase()
}

function string_replace(str: string, pattern: string | RegExp, replacement: string) {
    return str.replaceAll(pattern, replacement)
}

function string_split(str: string, sep: string): string[]
function string_split(str: string, sep: string, idx: number): string
function string_split(str: string, sep: string, idx?: number) {
    if (typeof idx !== "undefined") return str.split(sep)[idx]
    else return str.split(sep)
}

function string_contains(str: string, substr: string) {
    return str.indexOf(substr) !== -1 ? true : false
}

function string_contains_star(str: string) {
    return string_contains(str, "*")
}

function string_contains_star2(str: string) {
    return string_contains(str, "**")
}

function string_to_array(s: string | string[]) {
    if (Array.isArray(s)) return s
    return (s ?? "")
        .trim()
        .split(" ")
        .filter((s: string) => s !== "")
}

// does startswith sub-string?
// e.g.
// str="src/*.cpp"
// string_startswith(str, "src")
function string_startswith(str: string, subStr: string) {
    if (str.startsWith(subStr)) {
        return true
    }
    return false
}

// duplicate characters
// e.g. string_dupch(10, ".") => ...........
function string_dupch(count: number, ch: string) {
    return ch.repeat(count)
}

// replace file content
function _io_replace_file(infile: string, outfile: string, patterns: [string | RegExp, string][]) {
    let content = infile
    for (const [searchValue, replaceValue] of patterns) {
        content = content.replaceAll(searchValue, replaceValue)
    }
    return content
}

// try remove file or directory
function _os_tryrm(path: string) {
    if (fs.existsSync(path)) {
        if (fs.lstatSync(path).isDirectory()) {
            fs.rmdirSync(path)
        } else {
            fs.unlinkSync(path)
        }
    }
}

// get temporary file
function _os_tmpfile() {
    return tmp.fileSync().name
}

// try run program
function _os_runv(program: string, ...args: string[]) {
    let ok: number

    if (xmake_sh_diagnosis) {
        ok = execaSync(program, args, { shell: true }).exitCode
    } else {
        ok = execaSync(program, args, { shell: true, stdio: "ignore" }).exitCode
    }

    if (ok !== 0) {
        return false
    }
    return true
}

// try run program and get output
function _os_iorunv(program: string, ...args: string[]) {
    let ok: number
    let result: string = ""

    try {
        const { exitCode, stdout } = execaSync(program, args, {
            shell: true,
            stdio: "pipe",
        })
        ok = exitCode
        result = stdout
    } catch (error) {
        ok = 1
    }
    if (ok !== 0) {
        return ""
    }
    return result
}

// find file in the given directory
// e.g. _os_find . xmake.js
const _os_find = (dir: string, name: string, depth?: number) => {
    return fastGlob.sync(`${dir}/**/${name}`, {
        deep: depth,
    })
}

// get date, "%Y%m%d%H%M" -> 202212072222
function _os_date(format: string) {
    return dayjs().format("YYYYMMDDTHHmm")
}

function path_filename(str: string) {
    return path.basename(str)
}

function path_extension(str: string) {
    return path.extname(str)
}

function path_basename(str: string) {
    const result = path.parse(str)
    return result.name
}

function path_directory(str: string) {
    if (test_z(path)) raise("invalid empty path in path_directory().")

    return path.dirname(str)
}

function path_is_absolute(str: string) {
    return path.isAbsolute(str)
}

function path_relative(source: string, target: string) {
    return path.relative(source, target)
}

function path_sourcekind(file: string) {
    let sourcekind = ""
    if (file.endsWith(".cpp")) {
        sourcekind = "cxx"
    } else if (file.endsWith(".cc")) {
        sourcekind = "cxx"
    } else if (file.endsWith(".c")) {
        sourcekind = "cc"
    } else if (file.endsWith(".ixx")) {
        sourcekind = "cxx"
    } else if (file.endsWith(".mm")) {
        sourcekind = "mxx"
    } else if (file.endsWith(".m")) {
        sourcekind = "mm"
    } else if (file.endsWith(".S")) {
        sourcekind = "as"
    } else if (file.endsWith(".s")) {
        sourcekind = "as"
    } else if (file.endsWith(".asm")) {
        sourcekind = "as"
    } else {
        raise("unknown sourcekind for " + file)
    }
    return sourcekind
}

function path_toolname(path: string) {
    let toolname = ""
    if (path.endsWith("-gcc") || path.endsWith("/gcc")) {
        toolname = "gcc"
    } else if (path === "gcc") {
        toolname = "gcc"
    } else if (path.endsWith("-g++") || path.endsWith("/g++")) {
        toolname = "gxx"
    } else if (path === "g++") {
        toolname = "gxx"
    } else if (path.startsWith("xcrun") && path.endsWith("clang++")) {
        toolname = "clangxx"
    } else if (path.startsWith("xcrun") && path.endsWith("clang")) {
        toolname = "clang"
    } else if (path.endsWith("-clang++") || path.endsWith("/clang++")) {
        toolname = "clangxx"
    } else if (path === "clang++") {
        toolname = "clangxx"
    } else if (path.endsWith("-clang") || path.endsWith("/clang")) {
        toolname = "clang"
    } else if (path === "clang") {
        toolname = "clang"
    } else if (path.endsWith("-ar") || path.endsWith("/ar")) {
        toolname = "ar"
    } else if (path === "ar") {
        toolname = "ar"
    } else {
        throw new Error(`unknown tool ${path}`)
    }
    return toolname
}

const _get_flagname = (toolkind: string) => {
    let flagname = ""
    switch (toolkind) {
        case "cc":
            flagname = "cflags"
            break
        case "cxx":
            flagname = "cxxflags"
            break
        case "as":
            flagname = "asflags"
            break
        case "mm":
            flagname = "mflags"
            break
        case "mxx":
            flagname = "mxxflags"
            break
        case "ar":
            flagname = "arflags"
            break
        case "sh":
            flagname = "shflags"
            break
        case "ld":
            flagname = "ldflags"
            break
        default:
            throw new Error("unknown toolkind(" + toolkind + ")!")
    }
    return flagname
}

function _is_enabled(value: string | boolean) {
    return [true, "true", "yes", "y"].includes(value)
}

function _dedup(str: string) {
    const deduped: string[] = []
    const words = str.split(" ").filter((s: string) => s !== "")
    for (const word of words) {
        if (!deduped.includes(word)) {
            deduped.push(word)
        }
    }
    return deduped.join(" ")
}

function _dedup_reverse(str: string) {
    const deduped: string[] = []
    const words = str.split(" ").filter((s: string) => s !== "")
    for (let i = words.length - 1; i >= 0; i--) {
        const word = words[i]
        if (!deduped.includes(word)) {
            deduped.unshift(word)
        }
    }
    return deduped.join(" ")
}

const maps = new Map() // 用来存储所有映射的集合

// 返回给定名称的映射
const _map = (name: string) => {
    return maps.get(name)
}

// const _map_count = name => eval(`_map_${name}_count`);

// 返回给定名称的映射中指定 key 对应的值
const _map_get = (name: string, key: string) => {
    const map = maps.get(name)
    if (!map) return undefined
    return map.get(key)
}

// 判断给定名称的映射中是否存在指定 key
const _map_has = (name: string, key: string) => {
    const map = maps.get(name)
    if (!map) return false
    return map.has(key)
}

// 在给定名称的映射中设置指定 key 对应的值
const _map_set = (name: string, key: string, value: any) => {
    let map = maps.get(name)
    if (!map) {
        map = new Map()
        maps.set(name, map)
    }
    map.set(key, value)
}

// 在给定名称的映射中移除指定 key
// const _map_remove = (name, key) => {
//     const map = maps.get(name);
//     if (!map) return;
//     map.delete(key);
// };

// 返回给定名称的映射中所有 key 的数组
// const _map_keys = name => {
//     const map = maps.get(name);
//     if (!map) return [];
//     return Array.from(map.keys());
// };

let os_host = os.type().toLowerCase()

if (os_host.includes("cygwin")) {
    os_host = "cygwin"
}

if (os_host.includes("msys")) {
    os_host = "msys"
}

if (os_host.includes("mingw")) {
    os_host = "msys"
}

if (os_host.includes("darwin")) {
    os_host = "macosx"
}

if (os_host.includes("linux")) {
    os_host = "linux"
}

if (os_host.includes("freebsd")) {
    os_host = "freebsd"
}

if (os_host.includes("bsd")) {
    os_host = "bsd"
}

// determining host
// e.g.
// if is_host("linux", "macosx") {
// ...
// }
function is_host(...hosts: string[]) {
    return hosts.includes(os_host)
}

// detect host architecture
let os_arch = os.arch().toLowerCase()

if (test_eq(os_arch, "x64")) {
    os_arch = "x86_64" // keep same as 'uname -m'
}

if (test_eq(os_arch, "i686")) {
    os_arch = "i386"
}

// set the default target platform and architecture
let _target_plat_default = os_host
if (is_host("msys")) {
    _target_plat_default = "mingw"
}
const _target_arch_default = os_arch
const _target_mode_default = "release"

// set the default project generator and build program
let _project_generator = "gmake"
let _make_program_default = "make"
let _ninja_program_default = "ninja"
if (is_host("freebsd", "bsd")) {
    _make_program_default = "gmake"
    _ninja_program_default = "ninja"
} else if (is_host("msys", "cygwin")) {
    _make_program_default = "make.exe"
    _ninja_program_default = "ninja.exe"
}

// set the default directories
if (fs.existsSync("/usr/local")) {
    _install_prefix_default = "/usr/local"
} else if (fs.existsSync("/usr")) {
    _install_prefix_default = "/usr"
}
_install_bindir_default = "bin"
_install_libdir_default = "lib"
_install_includedir_default = "include"

// determining target platform
// e.g.
// if (is_plat("linux", "macosx")) {
//     ...
// }
function is_plat(...plats: string[]) {
    return plats.includes(_target_plat)
}

// determining target architecture
// e.g.
// if (is_arch("x86_64", "i386")) {
//     ...
// }
function is_arch(...archs: string[]) {
    return archs.includes(_target_arch)
}

// determining target mode
// e.g.
// if (is_mode("release")) {
//     ...
// }
function is_mode(...modes: string[]) {
    return modes.includes(_target_mode)
}

// determining target toolchain
// e.g.
// if (is_toolchain("clang")) {
//     ...
// }
function is_toolchain(...toolchains: string[]) {
    return toolchains.includes(_target_toolchain)
}
// set project name
function set_project(name: string) {
    _xmake_sh_project_name = name
}

// include the given xmake.js file or directory
// e.g. includes "src" "tests"
function includes(...paths: string[]) {
    for (const path of paths) {
        if (fs.existsSync(path) && fs.statSync(path).isFile()) {
            xmake_sh_scriptdir = dirname(path)
            eval(fs.readFileSync(path).toString())
        } else {
            const xmake_sh_scriptdir_cur = xmake_sh_scriptdir
            if (xmake_sh_scriptdir !== "") {
                xmake_sh_scriptdir = path_join(xmake_sh_scriptdir_cur, path)
                eval(fs.readFileSync(path_join(xmake_sh_scriptdir, "xmake.js")).toString())
            } else {
                eval(fs.readFileSync(path_join(xmake_sh_projectdir, path, "xmake.js")).toString())
            }
            xmake_sh_scriptdir = xmake_sh_scriptdir_cur
        }
    }
}
// split flags
function _split_flags(str: string) {
    return string_replace(str, ":", " ")
}

function _get_abstract_flag_for_gcc_clang(toolkind: string, toolname: string, itemname: string, value: string) {
    let flag = ""
    switch (itemname) {
        case "defines":
            flag = `-D${string_replace(value, '"', '\\"')}`
            break
        case "udefines":
            flag = `-U${value}`
            break
        case "includedirs":
            flag = `-I${value}`
            break
        case "linkdirs":
            flag = `-L${value}`
            break
        case "links":
            flag = `-l${value}`
            break
        case "syslinks":
            flag = `-l${value}`
            break
        case "frameworks":
            flag = `-framework ${value}`
            break
        case "frameworkdirs":
            flag = `-F${value}`
            break
        case "rpathdirs":
            if (toolname === "gcc" || toolname === "gxx") {
                // 在makefile中转义 $ORIGIN，TODO 我们也需要处理ninja
                value = value.replace("@loader_path", "$$$$ORIGIN")
                flag = `-Wl,-rpath='${value}'`
            } else if (toolname === "clang" || toolname === "clangxx") {
                value = value.replace("$ORIGIN", "@loader_path")
                flag = `-Xlinker -rpath -Xlinker ${value}`
            }
            break
        case "symbols":
            if (value === "debug") {
                flag = "-g"
            } else if (value === "hidden") {
                flag = "-fvisibility=hidden"
            }
            break
        case "strip":
            if (value === "debug") {
                flag = "-Wl,-S"
            } else if (value === "all") {
                if (is_plat("macosx")) {
                    flag = "-Wl,-x"
                } else {
                    flag = "-s"
                }
            }
            break
        case "warnings":
            if (value === "all" || value === "more" || value === "less") {
                flag = "-Wall"
            } else if (value === "allextra") {
                flag = "-Wall -Wextra"
            } else if (value === "error") {
                flag = "-Werror"
            } else if (value === "everything") {
                flag = "-Wall -Wextra"
            } else if (value === "none") {
                flag = "-w"
            }
            break
        case "optimizes":
            if (value === "fast") {
                flag = "-O1"
            } else if (value === "faster") {
                flag = "-O2"
            } else if (value === "fastest") {
                flag = "-O3"
            } else if (value === "smallest") {
                if (toolname === "clang" || toolname === "clangxx") {
                    flag = "-Oz"
                } else {
                    flag = "-Os"
                }
            } else if (value === "aggressive") {
                flag = "-Ofast"
            } else if (value === "none") {
                flag = "-O0"
            }
            break
        case "languages":
            if (toolkind === "cc" || toolkind === "mm") {
                switch (value) {
                    case "ansi":
                        flag = "-ansi"
                        break
                    case "c89":
                        flag = "-std=c89"
                        break
                    case "gnu89":
                        flag = "-std=gnu89"
                        break
                    case "c99":
                        flag = "-std=c99"
                        break
                    case "gnu99":
                        flag = "-std=gnu99"
                        break
                    case "c11":
                        flag = "-std=c11"
                        break
                    case "gnu11":
                        flag = "-std=gnu11"
                        break
                    case "c17":
                        flag = "-std=c17"
                        break
                    case "gnu17":
                        flag = "-std=gnu17"
                        break
                }
            } else if (toolkind === "cxx" || toolkind === "mxx") {
                switch (value) {
                    case "cxx98":
                        flag = "-std=c++98"
                        break
                    case "c++98":
                        flag = "-std=c++98"
                        break
                    case "gnuxx98":
                        flag = "-std=gnu++98"
                        break
                    case "gnu++98":
                        flag = "-std=gnu++98"
                        break

                    case "cxx11":
                        flag = "-std=c++11"
                        break
                    case "c++11":
                        flag = "-std=c++11"
                        break
                    case "gnuxx11":
                        flag = "-std=gnu++11"
                        break
                    case "gnu++11":
                        flag = "-std=gnu++11"
                        break

                    case "cxx14":
                        flag = "-std=c++14"
                        break
                    case "c++14":
                        flag = "-std=c++14"
                        break
                    case "gnuxx14":
                        flag = "-std=gnu++14"
                        break
                    case "gnu++14":
                        flag = "-std=gnu++14"
                        break

                    case "cxx17":
                        flag = "-std=c++17"
                        break
                    case "c++17":
                        flag = "-std=c++17"
                        break
                    case "gnuxx17":
                        flag = "-std=gnu++17"
                        break
                    case "gnu++17":
                        flag = "-std=gnu++17"
                        break

                    case "cxx1z":
                        flag = "-std=c++1z"
                        break
                    case "c++1z":
                        flag = "-std=c++1z"
                        break
                    case "gnuxx1z":
                        flag = "-std=gnu++1z"
                        break
                    case "gnu++1z":
                        flag = "-std=gnu++1z"
                        break

                    case "cxx2a":
                        flag = "-std=c++2a"
                        break
                    case "c++2a":
                        flag = "-std=c++2a"
                        break
                    case "gnuxx2a":
                        flag = "-std=gnu++2a"
                        break
                    case "gnu++2a":
                        flag = "-std=gnu++2a"
                        break
                    case "cxx20":
                        flag = "-std=c++20"
                        break
                    case "c++20":
                        flag = "-std=c++20"
                        break
                    case "gnuxx20":
                        flag = "-std=gnu++20"
                        break
                    case "gnu++20":
                        flag = "-std=gnu++20"
                        break
                    default:
                        if (value.startsWith("cxx")) {
                            throw new Error(`unknown language value(${value})!`)
                        }
                        if (value.startsWith("c++")) {
                            throw new Error(`unknown language value(${value})!`)
                        }
                        break
                }
            }
            break
        default:
            throw new Error(`unknown itemname(${itemname})!`)
    }
    return flag
}

// get abstract flags
const _get_abstract_flags = (toolkind: string, toolname: string, itemname: string, values: string) => {
    let flags = ""
    for (const value of string_to_array(values)) {
        let flag = ""
        switch (toolname) {
            case "gcc":
            case "gxx":
            case "clang":
            case "clangxx":
                flag = _get_abstract_flag_for_gcc_clang(toolkind, toolname, itemname, value)
                break
            default:
                throw new Error(`unknown toolname(${toolname})!`)
        }
        if (flag) {
            flags += ` ${flag}`
        }
    }
    return flags
}
//-----------------------------------------------------------------------------
// option configuration apis
//

// define option
const option = (name: string, description: string, _default: any) => {
    _xmake_sh_option_current = name
    if (!_loading_options) {
        if (test_nz(description)) _xmake_sh_option_current = ""
        return
    }
    if (!_map_has("options", `${name}_name`)) _xmake_sh_options = `${_xmake_sh_options} ${name}`
    _map_set("options", `${name}_name`, name)
    _map_set("options", `${name}_description`, description)
    _map_set("options", `${name}_default`, _default)

    // we end option if it's just one line
    if (test_nz(description)) _xmake_sh_option_current = ""
    return true
}

const option_end = () => {
    _xmake_sh_option_current = ""
}

_map("options")

// has the given option?
const _has_option = (name: string) => {
    return _map_has("options", `${name}_name`)
}

// get the given option item
const _get_option_item = (name: string, key: string) => {
    const value = _map_get("options", `${name}_${key}`)
    return value
}

// set the given option item
const _set_option_item = (name: string, key: string, value: any) => {
    if (test_nz(name)) {
        _map_set("options", `${name}_${key}`, value)
    } else {
        raise(`please call set_${key}(${value}) in the option scope!`)
    }
}

// add values to the given option item
const _add_option_item = (name: string, key: string, value: any) => {
    if (test_nz(name)) {
        const values = _map_get("options", `${name}_${key}`)
        const newValues = typeof values === "undefined" ? value : `${values} ${value}`
        _map_set("options", `${name}_${key}`, newValues)
    } else {
        throw new Error(`please call add_${key}(${value}) in the option scope!`)
    }
}

// get the give option value
function _get_option_value(name: string) {
    let value = _get_option_item(name, "value")
    if (test_z(value)) {
        value = _get_option_item(name, "default")
    }
    return value
}

// set the give option value
function _set_option_value(name: string, value: any) {
    _set_option_item(name, "value", value)
}

const _option_need_checking = (name: string) => {
    const _default = _get_option_item(name, "default") ?? ""
    if (test_nz(_default)) {
        return false
    }

    const cfuncs = _get_option_item(name, "cfuncs")
    const cxxfuncs = _get_option_item(name, "cxxfuncs")
    const cincludes = _get_option_item(name, "cincludes")
    const cxxincludes = _get_option_item(name, "cxxincludes")
    const ctypes = _get_option_item(name, "ctypes")
    const cxxtypes = _get_option_item(name, "cxxtypes")
    const csnippets = _get_option_item(name, "csnippets")
    const cxxsnippets = _get_option_item(name, "cxxsnippets")
    const links = _get_option_item(name, "links")
    const syslinks = _get_option_item(name, "syslinks")

    if (cfuncs || cxxfuncs || cincludes || cxxincludes || ctypes || cxxtypes || csnippets || cxxsnippets || links || syslinks) {
        return true
    }
    return false
}

// get options for the help menu
function _get_options_for_menu() {
    let options = ""
    for (const name of string_to_array(_xmake_sh_options)) {
        const showmenu = _get_option_item(name, "showmenu")
        if (_is_enabled(showmenu)) {
            options = `${options} ${name}`
        } else if (test_z(showmenu) && !_option_need_checking(name)) {
            options = `${options} ${name}`
        }
    }
    return options
}

// get options for checking
function _get_options_for_checking() {
    let options = ""
    for (const name of string_to_array(_xmake_sh_options)) {
        const showmenu = _get_option_item(name, "showmenu")
        if (!showmenu && _option_need_checking(name)) {
            options = `${options} ${name}`
        }
    }
    return options
}

// get abstract flags in option
function _get_option_abstract_flags(name: string, toolkind: string, toolname: string, itemname: string, values = "") {
    if (test_z(values)) {
        values = _get_option_item(name, itemname)
    }
    const flags = _get_abstract_flags(toolkind, toolname, itemname, values)
    return flags
}

// is config for option
function is_config(name: string, value: any) {
    if (!_loading_targets) {
        return false
    }
    const value_cur = _get_option_value(name)
    return value_cur === value
}

// has config for option
function has_config(name: string) {
    if (!_loading_targets) {
        return false
    }
    let value_cur = _get_option_value(name)
    return _is_enabled(value_cur)
}

// set config for option, we can use it to modify option status when loading targets
function set_config(name: string, value: any) {
    _set_option_value(name, value)
}

// set showmenu in option
function set_showmenu(show: any) {
    if (!_loading_options) {
        return
    }
    _set_option_item(_xmake_sh_option_current, "showmenu", show)
}

// set description in option
function set_description(description: any) {
    if (!_loading_options) return

    _set_option_item(_xmake_sh_option_current, "description", description)
}

// add cfuncs in option
function add_cfuncs(cfuncs: any) {
    if (!_loading_options) return

    _add_option_item(_xmake_sh_option_current, "cfuncs", cfuncs)
}

// add cxxfuncs in option
function add_cxxfuncs(cxxfuncs: any) {
    if (!_loading_options) return

    _add_option_item(_xmake_sh_option_current, "cxxfuncs", cxxfuncs)
}

// add cincludes in option
function add_cincludes(cincludes: any) {
    if (!_loading_options) return

    _add_option_item(_xmake_sh_option_current, "cincludes", cincludes)
}

// add cxxincludes in option
function add_cxxincludes(cxxincludes: any) {
    if (!_loading_options) return

    _add_option_item(_xmake_sh_option_current, "cxxincludes", cxxincludes)
}

// add ctypes in option
function add_ctypes(ctypes: any) {
    if (!_loading_options) return

    _add_option_item(_xmake_sh_option_current, "ctypes", ctypes)
}

// add cxxtypes in option
function add_cxxtypes(cxxtypes: any) {
    if (!_loading_options) return

    _add_option_item(_xmake_sh_option_current, "cxxtypes", cxxtypes)
}

// add csnippets in option
function add_csnippets(csnippets: any) {
    if (!_loading_options) return

    _add_option_item(_xmake_sh_option_current, "csnippets", csnippets)
}

// add cxxsnippets in option
function add_cxxsnippets(cxxsnippets: any) {
    if (!_loading_options) return

    _add_option_item(_xmake_sh_option_current, "cxxsnippets", cxxsnippets)
}

function target(name: string) {
    _xmake_sh_target_current = name
    if (!_loading_targets) return

    if (!_map_has("targets", `${name}_name`)) _xmake_sh_targets = `${_xmake_sh_targets} ${name}`
    _map_set("targets", `${name}_name`, name)
    return true
}

function target_end() {
    _xmake_sh_target_current = ""
}
_map("targets")

// has the given target?
function _has_target(name: string) {
    return _map_has("targets", name + "_name")
}

// has the given target item
function _has_target_item(name: string, key: string) {
    return _map_has("targets", name + "_" + key) || _map_has("targets", "__root_" + key)
}

// get the given target item
function _get_target_item(name: string, key: string) {
    let values = _map_get("targets", name + "_" + key)
    if (_map_has("targets", "__root_" + key)) {
        let root_values = _map_get("targets", "__root_" + key)
        if (test_nz(values)) values = root_values + " " + values
        else values = root_values
    }
    return values
}

// set the given target item
function _set_target_item(name: string, key: string, value: string | any[]) {
    if (test_nz(name)) {
        _map_set("targets", name + "_" + key, value)
    } else {
        _map_set("targets", "__root_" + key, value)
    }
}

// add values to the given target item
function _add_target_item(name: string, key: string, value: string) {
    if (test_nz(name)) {
        const values = _map_get("targets", `${name}_${key}`)
        const newValues = typeof values === "undefined" ? value : `${values} ${value}`
        _map_set("targets", `${name}_${key}`, newValues)
    } else {
        const values = _map_get("targets", `__root_${key}`)
        const newValues = typeof values === "undefined" ? value : `${values} ${value}`
        _map_set("targets", `__root_${key}`, newValues)
    }
}

function _is_target_default(name: string) {
    if (_has_target_item(name, "default")) {
        const defaultValue = _get_target_item(name, "default")
        return _is_enabled(defaultValue)
    }
    return true
}

function _get_target_basename(name: string) {
    return _get_target_item(name, "basename") ?? name
}

function _get_target_extension(name: string) {
    let extension = ""
    if (_has_target_item(name, "extension")) {
        extension = _get_target_item(name, "extension")
    } else if (is_plat("mingw")) {
        const kind = _get_target_item(name, "kind")
        if (kind === "binary") {
            extension = ".exe"
        } else if (kind === "static") {
            extension = ".a"
        } else if (kind === "shared") {
            extension = ".dll"
        }
    } else {
        const kind = _get_target_item(name, "kind")
        if (kind === "static") {
            extension = ".a"
        } else if (kind === "shared") {
            extension = ".so"
        }
    }
    return extension
}

const _get_target_prefixname = (name: string) => {
    let prefixname = ""
    if (_has_target_item(name, "prefixname")) {
        prefixname = _get_target_item(name, "prefixname")
    } else if (is_plat("mingw")) {
        let kind = _get_target_item(name, "kind")
        if (kind === "static") {
            prefixname = "lib"
        } else if (kind === "shared") {
            prefixname = "lib"
        }
    } else {
        let kind = _get_target_item(name, "kind")
        if (kind === "static") {
            prefixname = "lib"
        } else if (kind === "shared") {
            prefixname = "lib"
        }
    }
    return prefixname
}

const _get_target_filename = (name: string) => {
    let filename = _get_target_item(name, "filename")

    if (test_z(filename)) {
        let basename = _get_target_basename(name)
        let extension = _get_target_extension(name)
        let prefixname = _get_target_prefixname(name)
        filename = `${prefixname}${basename}${extension}`
    }

    return filename
}

const _get_targetdir = (name: string) => {
    let targetdir = _get_target_item(name, "targetdir")
    if (test_z(targetdir)) {
        targetdir = path_join(xmake_sh_buildir, _target_plat, _target_arch, _target_mode)
    }
    return targetdir
}

const _get_target_objectdir = (name: string) => {
    let objectdir = _get_target_item(name, "objectdir")
    if (test_z(objectdir)) {
        objectdir = path_join(xmake_sh_buildir, ".objs", name, _target_plat, _target_arch, _target_mode)
    }
    return objectdir
}

// 获取目标文件路径
function _get_target_file(name: string) {
    const filename = _get_target_filename(name)
    const targetdir = _get_targetdir(name)
    const targetfile = path_join(targetdir, filename)
    return targetfile
}

function _get_target_librarydeps_impl(name: string) {
    let librarydeps = ""
    let deps = _get_target_item(name, "deps")
    for (const dep of string_to_array(deps)) {
        let dep_kind = _get_target_item(dep, "kind")
        if (test_eq(dep_kind, "static") || test_eq(dep_kind, "shared")) {
            librarydeps += ` ${dep}`
            let dep_librarydeps = _get_target_librarydeps_impl(dep)
            if (test_nz(dep_librarydeps)) {
                librarydeps += ` ${dep_librarydeps}`
            }
        }
    }
    return librarydeps
}

function _get_target_librarydeps(name: string) {
    let librarydeps = _get_target_item(name, "librarydeps")
    if (test_z(librarydeps) && test_nq(librarydeps, "__none__")) {
        librarydeps = _get_target_librarydeps_impl(name)
        if (test_nz(librarydeps)) {
            librarydeps = _dedup_reverse(librarydeps)
            _set_target_item(name, "librarydeps", librarydeps)
        } else {
            _set_target_item(name, "librarydeps", "__none__")
        }
    }
    if (test_eq(librarydeps, "__none__")) {
        librarydeps = ""
    }
    return librarydeps
}

// 获取目标中的源文件
function _get_target_sourcefiles(name: string) {
    const sourcefiles = _get_target_item(name, "files")
    return sourcefiles
}

// 获取目标中的目标文件
function _get_target_objectfile(name: string, sourcefile: string) {
    let extension = ".o"
    if (is_plat("mingw")) {
        extension = ".obj"
    }
    const objectdir = _get_target_objectdir(name)
    const objectfile = path_join(objectdir, `${sourcefile}${extension}`)
    return objectfile
}

const _get_target_objectfiles = (name: string) => {
    const sourcefiles = _get_target_sourcefiles(name) ?? ""
    let objectfiles = string_to_array(sourcefiles)
        .map((sourcefile) => _get_target_objectfile(name, sourcefile))
        .join(" ")
    return objectfiles
}

// 获取目标抽象标志
function _get_target_abstract_flags(name: string, toolkind: string, toolname: string, itemname: string, values?: string) {
    let _values = values ?? ""
    if (_values === "") {
        _values = _get_target_item(name, itemname) ?? []
        const deps = _get_target_librarydeps(name) ?? ""
        _values = string_to_array(deps)
            .reduce((values: string[], dep) => {
                const dep_kind = _get_target_item(dep, "kind")
                if (test_eq(dep_kind, "static") || test_eq(dep_kind, "shared")) {
                    const depvalues = _get_target_item(dep, `${itemname}_public`)
                    if (test_nz(depvalues)) {
                        return [...values, depvalues]
                    }
                }
                return values
            }, string_to_array(_values))
            .join(" ")
    }
    const flags = _get_abstract_flags(toolkind, toolname, itemname, _values)
    return flags
}

// 获取目标工具链ar标志
function _get_target_toolchain_flags_for_ar() {
    return "-cr"
}

// get toolchain flags for gcc in target
function _get_target_toolchain_flags_for_gcc(name: string, toolkind: string) {
    let flags = ""

    if (is_arch("i386")) {
        flags = "-m32"
    }
    const targetkind = _get_target_item(name, "kind")
    if (test_eq(targetkind, "shared") && test_eq(toolkind, "sh")) {
        flags = "-shared -fPIC"
    }
    return flags
}
// get toolchain flags for clang in target
function _get_target_toolchain_flags_for_clang(name: string, toolkind: string) {
    let flags = "-Qunused-arguments"

    if (is_arch("i386")) {
        flags = "-m32"
    }
    const targetkind = _get_target_item(name, "kind")
    if (test_eq(targetkind, "shared") && test_eq(toolkind, "sh")) {
        flags = "-shared -fPIC"
    }
    return flags
}

const _get_target_toolchain_flags = (name: string, toolkind: string, toolname: string) => {
    let flags = ""
    switch (toolname) {
        case "gcc":
            flags = _get_target_toolchain_flags_for_gcc(name, toolkind)
            break
        case "gxx":
            flags = _get_target_toolchain_flags_for_gcc(name, toolkind)
            break
        case "clang":
            flags = _get_target_toolchain_flags_for_clang(name, toolkind)
            break
        case "clangxx":
            flags = _get_target_toolchain_flags_for_clang(name, toolkind)
            break
        case "ar":
            flags = _get_target_toolchain_flags_for_ar()
            break
        default:
            throw new Error("unknown toolname(" + toolname + ")!")
            break
    }
    return flags
}

const _get_target_compiler_flags = (name: string, toolkind: string) => {
    const program = _get_toolchain_toolset(_target_toolchain, toolkind)
    const toolname = path_toolname(program)
    let result = ""
    // get toolchain flags
    const toolchain_flags = _get_target_toolchain_flags(name, toolkind, toolname)
    if (test_nz(toolchain_flags)) {
        result = `${result} ${toolchain_flags}`
    }

    // get abstract flags
    const itemnames = ["symbols", "optimizes", "warnings", "languages", "defines", "undefines", "includedirs", "frameworkdirs", "frameworks"]
    for (const itemname of itemnames) {
        const flags = _get_target_abstract_flags(name, toolkind, toolname, itemname)
        if (test_nz(flags)) {
            result = `${result} ${flags}`
        }
    }

    // get raw flags, e.g. add_cflags, add_cxxflags
    const flagname = _get_flagname(toolkind)
    let flags = _get_target_item(name, flagname)
    if (test_nz(flags)) {
        result = `${result} ${flags}`
    }
    if (test_eq(flagname, "cflags") || test_eq(flagname, "cxxflags")) {
        flags = _get_target_item(name, "cxflags")
        if (test_nz(flags)) {
            result = `${result} ${flags}`
        }
    } else if (test_eq(flagname, "mflags") || test_eq(flagname, "mxxflags")) {
        flags = _get_target_item(name, "mxflags")
        if (test_nz(flags)) {
            result = `${result} ${flags}`
        }
    }

    return result
}

function _get_target_linker_flags(name: string, toolkind: string) {
    const program = _get_toolchain_toolset(_target_toolchain, toolkind)
    const toolname = path_toolname(program)
    let result = ""

    // get toolchain flags
    const toolchain_flags = _get_target_toolchain_flags(name, toolkind, toolname)
    if (test_nz(toolchain_flags)) {
        result = `${result} ${toolchain_flags}`
    }

    // get flags from target deps
    const deps = _get_target_librarydeps(name) ?? ""
    string_to_array(deps).forEach((dep) => {
        const dep_kind = _get_target_item(dep, "kind")
        if (test_eq(dep_kind, "static") || test_eq(dep_kind, "shared")) {
            const dep_targetdir = _get_targetdir(dep)
            const dep_basename = _get_target_basename(dep)
            const linkdirs_flags = _get_target_abstract_flags(dep, toolkind, toolname, "linkdirs", dep_targetdir)
            const links_flags = _get_target_abstract_flags(dep, toolkind, toolname, "links", dep_basename)
            if (test_eq(dep_kind, "shared")) {
                let rpathdir = "@loader_path"
                const targetdir = _get_targetdir(name)
                const subdir = path_relative(targetdir, dep_targetdir)
                if (test_nz(subdir)) {
                    rpathdir = path_join(rpathdir, subdir)
                }
                const rpathdirs_flags = _get_target_abstract_flags(dep, toolkind, toolname, "rpathdirs", rpathdir)
                result = `${result} ${rpathdirs_flags}`
            }
            result = `${result} ${linkdirs_flags} ${links_flags}`
        }
    })

    // get abstract flags
    const itemnames = ["strip", "frameworkdirs", "linkdir", "links", "rpathdirs", "frameworks", "syslinks"]
    itemnames.forEach((itemname) => {
        const flags = _get_target_abstract_flags(name, toolkind, toolname, itemname)
        if (test_nz(flags)) {
            result = `${result} ${flags}`
        }
    })

    // get raw flags, e.g. add_ldflags, add_shflags
    const flagname = _get_flagname(toolkind)
    const flags = _get_target_item(name, flagname)
    if (test_nz(flags)) {
        result = `${result} ${flags}`
    }

    return result
}

// 获取目标的归档器标志
function _get_target_archiver_flags(name: string, toolkind: string) {
    const program = _get_toolchain_toolset(_target_toolchain, toolkind)
    const toolname = path_toolname(program)
    let result = ""
    // 获取工具链标志
    const toolchain_flags = _get_target_toolchain_flags(name, toolkind, toolname)
    if (test_nz(toolchain_flags)) {
        result = `${result} ${toolchain_flags}`
    }

    // 获取原始标志，如add_arflags
    const flagname = _get_flagname(toolkind)
    const flags = _get_target_item(name, flagname)
    if (test_nz(flags)) {
        result = `${result} ${flags}`
    }

    return result
}

// 获取目标标志
function _get_target_flags(name: string, toolkind: string) {
    let flags = ""
    if (toolkind === "sh") {
        flags = _get_target_linker_flags(name, toolkind)
    } else if (toolkind === "ld") {
        flags = _get_target_linker_flags(name, toolkind)
    } else if (toolkind === "ar") {
        flags = _get_target_archiver_flags(name, toolkind)
    } else {
        flags = _get_target_compiler_flags(name, toolkind)
    }
    return flags
}

// 添加文件路径到目标
const _add_target_filepaths = (key: string, ...files: string[]) => {
    // we need avoid escape * automatically in for-loop
    const list = files.map((file) => file.replace(/\*/g, "?"))

    if (test_eq(key, "files")) {
        for (const file of list) {
            const sourcekind = path_sourcekind(file)
            _targets_toolkinds = `${_targets_toolkinds} ${sourcekind}`
        }
    }

    for (let file of list) {
        file = file.replace(/\?/g, "*")
        if (!path_is_absolute(file)) {
            file = path_join(xmake_sh_scriptdir, file)
        }
        let files = []
        if (string_contains(file, "**")) {
            const dir = path_directory(file)
            const name = path_filename(file)
            files = _os_find(dir, name)
        } else if (string_contains(file, "*")) {
            const dir = path_directory(file)
            const name = path_filename(file)
            files = _os_find(dir, name, 1)
        } else {
            files = [file]
        }

        for (let file of files) {
            file = path_relative(xmake_sh_projectdir, file)
            _add_target_item(_xmake_sh_target_current, key, file)
        }
    }
}

const _add_target_installpaths = (key: string, filepattern: string, prefixdir: string = "", filename: string = "") => {
    // get root directory, e.g. "src/foo/(*.h)" -> "src/foo"
    let rootdir = ""
    if (string_contains(filepattern, "(")) {
        rootdir = string_split(filepattern, "(", 0)
        rootdir = rootdir.replace(/\/$/, "")
        if (!path_is_absolute(rootdir)) {
            rootdir = path_join(xmake_sh_scriptdir, rootdir)
        }
        rootdir = path_relative(xmake_sh_projectdir, rootdir)
        rootdir = rootdir.replace(/\/$/, "")
    }

    // remove (), e.g. "src/(.h)" -> "src/.h"
    filepattern = string_replace(filepattern, "(", "")
    filepattern = string_replace(filepattern, ")", "")

    // get real path
    if (!path_is_absolute(filepattern)) {
        filepattern = path_join(xmake_sh_scriptdir, filepattern)
    }
    let files = []
    if (string_contains(filepattern, "**")) {
        const dir = path_directory(filepattern)
        const name = path_filename(filepattern)
        files = _os_find(dir, name)
    } else if (string_contains(filepattern, "*")) {
        const dir = path_directory(filepattern)
        const name = path_filename(filepattern)
        files = _os_find(dir, name, 1)
    } else {
        files = [filepattern]
    }
    for (let file of files) {
        file = path_relative(xmake_sh_projectdir, file)
        _add_target_item(_xmake_sh_target_current, key, `${file}:${rootdir}:${prefixdir ?? ""}:${filename ?? ""}`)
    }
}

// set target file path
function _set_target_filepath(key: string, path: string) {
    if (!path_is_absolute(path)) {
        path = path_join(xmake_sh_scriptdir, path)
    }
    path = path_relative(xmake_sh_projectdir, path)
    _set_target_item(_xmake_sh_target_current, key, path)
}

// set kind in target
function set_kind(kind: string) {
    if (!_loading_targets) return
    _set_target_item(_xmake_sh_target_current, "kind", kind)
    switch (kind) {
        case "binary":
            _targets_toolkinds = `${_targets_toolkinds} ld`
            break
        case "static":
            _targets_toolkinds = `${_targets_toolkinds} ar`
            break
        case "shared":
            _targets_toolkinds = `${_targets_toolkinds} sh`
            break
        default:
            raise(`unknown target kind ${kind}`)
            break
    }
}

// set version in target
function set_version(version: string, version_build: string) {
    if (!_loading_targets) return
    _set_target_item(_xmake_sh_target_current, "version", version)
    _set_target_item(_xmake_sh_target_current, "version_build", version_build)
}

// set default in target
function set_default(_default: string) {
    if (_loading_targets && test_z(_xmake_sh_option_current)) {
        _set_target_item(_xmake_sh_target_current, "default", _default)
    } else if (_loading_options && test_nz(_xmake_sh_option_current)) {
        _set_option_item(_xmake_sh_option_current, "default", _default)
    }
}

// set configvar in target
function set_configvar(name: string, value: string) {
    if (!_loading_targets) return
    _set_target_item(_xmake_sh_target_current, `configvar_${name}`, value)
    _add_target_item(_xmake_sh_target_current, "configvars", name)
}

// set filename in target
function set_filename(filename: string) {
    if (!_loading_targets) return
    _set_target_item(_xmake_sh_target_current, "filename", filename)
}

// set basename in target
function set_basename(basename: string) {
    if (!_loading_targets) return
    _set_target_item(_xmake_sh_target_current, "basename", basename)
}

// set extension in target
function set_extension(extension: string) {
    if (!_loading_targets) return
    _set_target_item(_xmake_sh_target_current, "extension", extension)
}

// set prefixname in target
function set_prefixname(prefixname: string) {
    if (!_loading_targets) return
    _set_target_item(_xmake_sh_target_current, "prefixname", prefixname)
}

// set target directory
function set_targetdir(dir: string) {
    if (!_loading_targets) return
    _set_target_filepath("targetdir", dir)
}

// set target object directory
function set_objectdir(dir: string) {
    if (!_loading_targets) return
    _set_target_filepath("objectdir", dir)
}

// set target config directory
function set_configdir(dir: string) {
    if (!_loading_targets) return
    _set_target_filepath("configdir", dir)
}

// set target install directory
function set_installdir(dir: string) {
    if (!_loading_targets) return
    _set_target_filepath("installdir", dir)
}

// add deps in target
function add_deps(...args: string[]) {
    if (!_loading_targets) return
    for (let dep of args) {
        _add_target_item(_xmake_sh_target_current, "deps", dep)
    }
}

// add files in target
function add_files(...args: string[]) {
    if (!_loading_targets) return
    _add_target_filepaths("files", ...args)
}

// add install files in target
const add_installfiles = (filepattern: string, prefixdir: string = "", filename: string = "") => {
    if (!_loading_targets) return
    _add_target_installpaths("installfiles", filepattern, prefixdir, filename)
}

// add header files in target
const add_headerfiles = (filepattern: string, prefixdir: string = "", filename: string = "") => {
    if (!_loading_targets) return
    _add_target_installpaths("headerfiles", filepattern, prefixdir, filename)
}

// add config files in target
function add_configfiles(...args: string[]) {
    if (!_loading_targets) return
    _add_target_filepaths("configfiles", ...args)
}

// add defines in target
function add_defines(...args: string[]) {
    if (_loading_targets && test_z(_xmake_sh_option_current)) {
        let _public = false
        for (let define of args) {
            if (test_nq(define, "{public}")) _add_target_item(_xmake_sh_target_current, "defines", define)
            else _public = true
        }

        if (_public) {
            for (let define of args) {
                if (test_nq(define, "{public}")) _add_target_item(_xmake_sh_target_current, "defines_public", define)
            }
        }
    } else if (_loading_options && test_nz(_xmake_sh_option_current)) {
        for (let define of args) {
            _add_option_item(_xmake_sh_option_current, "defines", define)
        }
    }
}

// add udefines in target
function add_udefines(...args: string[]) {
    if (_loading_targets && test_z(_xmake_sh_option_current)) {
        let _public = false
        for (let udefine of args) {
            if (test_nq(udefine, "{public}")) _add_target_item(_xmake_sh_target_current, "udefines", udefine)
            else _public = true
        }

        if (_public) {
            for (let udefine of args) {
                if (test_nq(udefine, "{public}")) _add_target_item(_xmake_sh_target_current, "undefines_public", udefine)
            }
        }
    } else if (_loading_options && test_nz(_xmake_sh_option_current)) {
        for (let udefine of args) {
            _add_option_item(_xmake_sh_option_current, "udefines", udefine)
        }
    }
}

// add includedirs in target
function add_includedirs(...args: string[]) {
    let _public = false
    for (let dir of args) {
        if (test_nq(dir, "{public}")) {
            if (!path_is_absolute(dir)) {
                dir = path_join(xmake_sh_scriptdir, dir)
            }
            dir = path_relative(xmake_sh_projectdir, dir)
            if (_loading_targets && test_z(_xmake_sh_option_current)) {
                _add_target_item(_xmake_sh_target_current, "includedirs", dir)
            } else if (_loading_options && test_nz(_xmake_sh_option_current)) {
                _add_option_item(_xmake_sh_option_current, "includedirs", dir)
            }
        } else {
            _public = true
        }
    }

    if (_public) {
        for (let dir of args) {
            if (test_nq(dir, "{public}")) {
                if (!path_is_absolute(dir)) {
                    dir = path_join(xmake_sh_scriptdir, dir)
                }
                dir = path_relative(xmake_sh_projectdir, dir)
                if (_loading_targets && test_z(_xmake_sh_option_current)) {
                    _add_target_item(_xmake_sh_target_current, "includedirs_public", dir)
                }
            }
        }
    }
}

// add links in target
function add_links(...args: string[]) {
    if (_loading_targets && test_z(_xmake_sh_option_current)) {
        let _public = false
        for (let link of args) {
            if (test_nq(link, "{public}")) _add_target_item(_xmake_sh_target_current, "links", link)
            else _public = true
        }

        if (_public) {
            for (let link of args) {
                if (test_nq(link, "{public}")) _add_target_item(_xmake_sh_target_current, "links_public", link)
            }
        }
    } else if (_loading_options && test_nz(_xmake_sh_option_current)) {
        for (const link of args) {
            _add_option_item(_xmake_sh_option_current, "links", link)
        }
    }
}

// add syslinks in target
function add_syslinks(...args: string[]) {
    if (_loading_targets && test_z(_xmake_sh_option_current)) {
        let _public = false
        for (let syslink of args) {
            if (test_nq(syslink, "{public}")) _add_target_item(_xmake_sh_target_current, "syslinks", syslink)
            else _public = true
        }

        if (_public) {
            for (let syslink of args) {
                if (test_nq(syslink, "{public}")) _add_target_item(_xmake_sh_target_current, "syslinks_public", syslink)
            }
        }
    } else if (_loading_options && test_nz(_xmake_sh_option_current)) {
        for (const syslink of args) {
            _add_option_item(_xmake_sh_option_current, "syslinks", syslink)
        }
    }
}

// add linkdirs in target
function add_linkdirs(...args: string[]) {
    let _public = false
    for (let dir of args) {
        if (test_nq(dir, "{public}")) {
            if (!path_is_absolute(dir)) {
                dir = path_join(xmake_sh_scriptdir, dir)
            }
            dir = path_relative(xmake_sh_projectdir, dir)
            if (_loading_targets && test_z(_xmake_sh_option_current)) {
                _add_target_item(_xmake_sh_target_current, "linkdirs", dir)
            } else if (_loading_options && test_nz(_xmake_sh_option_current)) {
                _add_option_item(_xmake_sh_option_current, "linkdirs", dir)
            }
        } else {
            _public = true
        }
    }

    if (_public) {
        for (let dir of args) {
            if (test_nq(dir, "{public}")) {
                if (!path_is_absolute(dir)) {
                    dir = path_join(xmake_sh_scriptdir, dir)
                }
                dir = path_relative(xmake_sh_projectdir, dir)
                if (_loading_targets && test_z(_xmake_sh_option_current)) {
                    _add_target_item(_xmake_sh_target_current, "linkdirs_public", dir)
                }
            }
        }
    }
}

// add rpathdirs in target
function add_rpathdirs(...dirs: string[]) {
    if (!_loading_targets) return
    for (let dir of dirs) {
        if (!path_is_absolute(dir)) {
            dir = path_join(xmake_sh_scriptdir, dir)
        }
        dir = path_relative(xmake_sh_projectdir, dir)
        _add_target_item(_xmake_sh_target_current, "rpathdirs", dir)
    }
}

// add frameworks in target
function add_frameworks(...args: string[]) {
    if (_loading_targets && test_z(_xmake_sh_option_current)) {
        let _public = false
        for (let framework of args) {
            if (test_nq(framework, "{public}")) _add_target_item(_xmake_sh_target_current, "frameworks", framework)
            else _public = true
        }

        if (_public) {
            for (let framework of args) {
                if (test_nq(framework, "{public}")) _add_target_item(_xmake_sh_target_current, "frameworks_public", framework)
            }
        }
    } else if (_loading_options && test_nz(_xmake_sh_option_current)) {
        for (const framework of args) {
            _add_option_item(_xmake_sh_option_current, "frameworks", framework)
        }
    }
}

// add frameworkdirs in target
function add_frameworkdirs(...dirs: string[]) {
    for (let dir of dirs) {
        if (!path_is_absolute(dir)) {
            dir = path_join(xmake_sh_scriptdir, dir)
        }
        dir = path_relative(xmake_sh_projectdir, dir)
        if (_loading_targets && test_z(_xmake_sh_option_current)) {
            _add_target_item(_xmake_sh_target_current, "frameworkdirs", dir)
        } else if (_loading_options && test_nz(_xmake_sh_option_current)) {
            _add_option_item(_xmake_sh_option_current, "frameworkdirs", dir)
        }
    }
}

// set strip in target
function set_strip(strip: string) {
    if (!_loading_targets) return
    _set_target_item(_xmake_sh_target_current, "strip", strip)
}

// set symbols in target
function set_symbols(symbols: string) {
    if (!_loading_targets) return
    _set_target_item(_xmake_sh_target_current, "symbols", symbols)
}

// set languages in target
function set_languages(...languages: string[]) {
    if (_loading_targets && test_z(_xmake_sh_option_current)) {
        _set_target_item(_xmake_sh_target_current, "languages", languages)
    } else if (_loading_options && test_nz(_xmake_sh_option_current)) {
        _set_option_item(_xmake_sh_option_current, "languages", languages)
    }
}

// set warnings in target
function set_warnings(...warnings: string[]) {
    if (_loading_targets && test_z(_xmake_sh_option_current)) {
        _set_target_item(_xmake_sh_target_current, "warnings", warnings)
    } else if (_loading_options && test_nz(_xmake_sh_option_current)) {
        _set_option_item(_xmake_sh_option_current, "warnings", warnings)
    }
}

// set optimizes in target
function set_optimizes(...optimizes: string[]) {
    if (_loading_targets && test_z(_xmake_sh_option_current)) {
        _set_target_item(_xmake_sh_target_current, "optimizes", optimizes)
    } else if (_loading_options && test_nz(_xmake_sh_option_current)) {
        _set_option_item(_xmake_sh_option_current, "optimizes", optimizes)
    }
}

// add cflags in target
function add_cflags(...flags: string[]) {
    if (_loading_targets && test_z(_xmake_sh_option_current)) {
        for (const flag of arguments) {
            _add_target_item(_xmake_sh_target_current, "cflags", flag)
        }
    } else if (_loading_options && test_nz(_xmake_sh_option_current)) {
        for (const flag of arguments) {
            _add_option_item(_xmake_sh_option_current, "cflags", flag)
        }
    }
}

// add cxflags in target
function add_cxflags(...flags: string[]) {
    if (_loading_targets && test_z(_xmake_sh_option_current)) {
        for (const flag of arguments) {
            _add_target_item(_xmake_sh_target_current, "cxflags", flag)
        }
    } else if (_loading_options && test_nz(_xmake_sh_option_current)) {
        for (const flag of arguments) {
            _add_option_item(_xmake_sh_option_current, "cxflags", flag)
        }
    }
}

const add_cxxflags = (...flags: string[]) => {
    if (_loading_targets && test_z(_xmake_sh_option_current)) {
        flags.forEach((flag) => {
            _add_target_item(_xmake_sh_target_current, "cxxflags", flag)
        })
    } else if (_loading_options && test_nz(_xmake_sh_option_current)) {
        flags.forEach((flag) => {
            _add_option_item(_xmake_sh_option_current, "cxxflags", flag)
        })
    }
}

const add_asflags = (...flags: string[]) => {
    if (!_loading_targets) return
    flags.forEach((flag) => {
        _add_target_item(_xmake_sh_target_current, "asflags", flag)
    })
}

const add_mflags = (...flags: string[]) => {
    if (!_loading_targets) return
    flags.forEach((flag) => {
        _add_target_item(_xmake_sh_target_current, "mflags", flag)
    })
}

const add_mxflags = (...flags: string[]) => {
    if (!_loading_targets) return
    flags.forEach((flag) => {
        _add_target_item(_xmake_sh_target_current, "mxflags", flag)
    })
}

const add_mxxflags = (...flags: string[]) => {
    if (!_loading_targets) return
    flags.forEach((flag) => {
        _add_target_item(_xmake_sh_target_current, "mxxflags", flag)
    })
}

const add_ldflags = (...flags: string[]) => {
    if (!_loading_targets) return
    flags.forEach((flag) => {
        _add_target_item(_xmake_sh_target_current, "ldflags", flag)
    })
}

const add_shflags = (...flags: string[]) => {
    if (!_loading_targets) return
    flags.forEach((flag) => {
        _add_target_item(_xmake_sh_target_current, "shflags", flag)
    })
}

const add_arflags = (...flags: string[]) => {
    if (!_loading_targets) return
    flags.forEach((flag) => {
        _add_target_item(_xmake_sh_target_current, "arflags", flag)
    })
}

// 工具链配置API

// 定义工具链
function toolchain(name: string) {
    _xmake_sh_toolchain_current = name
    if (!_loading_toolchains) {
        return
    }
    _xmake_sh_toolchains = `${_xmake_sh_toolchains} ${name}`
    _map_set("toolchains", `${name}_name`, name)
    return true
}

function toolchain_end() {
    _xmake_sh_toolchain_current = ""
}
_map("toolchains")

// 是否有指定的工具链
function _has_toolchain(name: string) {
    return _map_has("toolchains", `${name}_name`)
}

// 获取指定的工具链项目
function _get_toolchain_item(name: string, key: string) {
    const value = _map_get("toolchains", `${name}_${key}`)
    return value
}

// 设置指定的工具链项目
function _set_toolchain_item(name: string, key: string, value: any) {
    if (test_nz(name)) {
        _map_set("toolchains", `${name}_${key}`, value)
    } else {
        raise("please set toolchain in the toolchain scope!")
    }
}

// 获取指定的工具链工具集
function _get_toolchain_toolset(name: string, kind: string) {
    const programs = _get_toolchain_item(name, `toolset_${kind}`)
    return programs
}

// 设置指定的工具链工具集
function _set_toolchain_toolset(name: string, kind: string, programs: string) {
    _set_toolchain_item(name, `toolset_${kind}`, programs)
}

function _add_toolchain_toolset(name: string, kind: string, program: string) {
    let programs = _get_toolchain_item(name, `toolset_${kind}`)
    if (test_nz(programs)) programs = `${programs}:${program}`
    else programs = `${program}`
    _set_toolchain_item(name, `toolset_${kind}`, programs)
}

const set_toolset = (kind: string, ...programs: string[]) => {
    if (!_loading_toolchains) {
        return
    }

    let idx = 0
    for (const program of programs) {
        let key = kind
        if (idx !== 0) key = `${kind}_${idx}`
        _set_toolchain_toolset(_xmake_sh_toolchain_current, key, program)
        idx++
    }
}

// 加载选项
//

// 加载选项和工具链
function _load_options_and_toolchains() {
    _loading_options = true
    _loading_toolchains = true
    _loading_targets = false
    let file = xmake_sh_projectdir + "/xmake.js"
    if (fs.existsSync(file)) {
        includes(file)
    } else {
        // 包含下一个子目录中的所有xmake.sh文件
        let files = fastGlob.sync(`${xmake_sh_projectdir}/**/xmake.js`, {
            deep: 2,
        })
        for (const file of files) {
            includes(file)
        }
    }
}
_load_options_and_toolchains()

// 显示选项用法
function _show_options_usage() {
    let options = _get_options_for_menu()
    let result = ""

    for (const name of string_to_array(options)) {
        let description = _get_option_item(name, "description") ?? ""
        let _default = _get_option_item(name, "default")
        let head = "--" + name + "=" + string_toupper(name)
        let headsize = head.length
        let tail = description

        if (typeof _default !== "undefined") {
            let defval = _is_enabled(_default) ? "yes" : "no"
            tail = `${tail} (default: ${defval})`
        }
        let width = 24
        let padding_width = width - headsize
        let padding = " ".repeat(padding_width)
        result += `  ${head}${padding}${tail}\n`
    }

    return result
}
// show configure usage
function _show_usage() {
    console.log(`
Usage: ${process.argv[0]} [<options>...]
Options: [defaults in brackets after descriptions]
Common options:
  --help                  Print this message.
  --version               Only print version information.
  --verbose               Display more information.
  --diagnosis             Display lots of diagnosis information.

  --generator=GENERATOR   Set the project generator. (default: ${_project_generator})
                            - gmake
                            - ninja
  --make=MAKE             Set the make program. (default: ${_make_program_default})
  --ninja=NINJA           Set the Ninja program. (default: ${_ninja_program_default})
  --plat=PLAT             Compile for the given platform. (default: ${_target_plat_default})
                            - msys
                            - cross
                            - bsd
                            - mingw
                            - macosx
                            - linux
  --arch=ARCH             Compile for the given architecture. (default: ${_target_arch_default})
                            - msys: i386 x86_64
                            - cross: i386 x86_64 arm arm64 mips mips64 riscv riscv64 s390x ppc ppc64 sh4
                            - bsd: i386 x86_64
                            - mingw: i386 x86_64 arm arm64
                            - macosx: x86_64 arm64
                            - linux: i386 x86_64 armv7 armv7s arm64-v8a mips mips64 mipsel mips64el
  --mode=MODE             Set the given compilation mode. (default: ${_target_mode_default})
                            - release
                            - debug
  --toolchain=TOOLCHAIN   Set toolchain name.
                            - clang
                            - gcc

  --prefix=PREFIX         Set install files directory in tree rooted at PREFIX. (default: ${_install_prefix_default})
  --bindir=DIR            Set install binaries directory in PREFIX/DIR. (default: ${_install_bindir_default})
  --libdir=DIR            Set install libraries directory in PREFIX/DIR. (default: ${_install_libdir_default})
  --includedir=DIR        Set install includes directory in PREFIX/DIR. (default: ${_install_includedir_default})
  --buildir=DIR           Set build directory. (default: ${xmake_sh_buildir})

Project options:
${_show_options_usage()}`)
    process.exit(1)
}

// show xmake.js version
function _show_version() {
    console.log(`xmake.js v${xmake_sh_version}, A script-only build utility like autotools`)
    console.log(xmake_sh_copyright)

    console.log(`                         _               _            
    __  ___ __  __  __ _| | ______   ___| |__         
    \\ \\/ / |  \\/  |/ _  | |/ / __ \\ / __| '_  \\       
     >  <  | \\__/ | /_| |   <  ___/_\\__ \\ | | |       
    /_/\\_\\_|_|  |_|\\__ \\|_|\\_\\____(_)___/_| |_|       
                                     by ruki, xmake.io
                                                      
   👉  Manual: https://xmake.io/#/getting_started     
   🙏  Donate: https://xmake.io/#/sponsor             
                                                      `)
    process.exit(2)
}

// --foo=yes => foo
function _parse_argument_name(arg: string, separator?: string) {
    return arg.replace(/^--/, "").replace(new RegExp(`${separator ?? "=[^=]*"}$`), "")
}

// --foo=yes => yes
function _parse_argument_value(arg: string, separator?: string) {
    return arg.replace(new RegExp(`^${separator ?? "[^=]*="}`), "")
}

const _handle_option = (arg: string | undefined) => {
    const name = _parse_argument_name(arg ?? "")
    const value = _parse_argument_value(arg ?? "")
    if (test_eq(name, "help")) {
        _show_usage()
        return true
    } else if (test_eq(name, "version")) {
        _show_version()
        return true
    } else if (test_eq(name, "verbose")) {
        xmake_sh_verbose = true
        return true
    } else if (test_eq(name, "diagnosis")) {
        xmake_sh_diagnosis = true
        return true
    } else if (test_eq(name, "plat")) {
        _target_plat = value
        return true
    } else if (test_eq(name, "arch")) {
        _target_arch = value
        return true
    } else if (test_eq(name, "mode")) {
        _target_mode = value
        return true
    } else if (test_eq(name, "toolchain")) {
        _target_toolchain = value
        return true
    } else if (test_eq(name, "generator")) {
        _project_generator = value
        return true
    } else if (test_eq(name, "make")) {
        _make_program = value
        return true
    } else if (test_eq(name, "ninja")) {
        _ninja_program = value
        return true
    } else if (test_eq(name, "prefix")) {
        _install_prefix_default = value
        return true
    } else if (test_eq(name, "bindir")) {
        _install_bindir_default = value
        return true
    } else if (test_eq(name, "libdir")) {
        _install_libdir_default = value
        return true
    } else if (test_eq(name, "includedir")) {
        _install_includedir_default = value
        return true
    } else if (test_eq(name, "buildir")) {
        xmake_sh_buildir = value
        return true
    } else if (_has_option(name)) {
        _set_option_value(name, value)
        return true
    }
    return false
}
const args = process.argv.slice(2) // 获取命令行参数，去除node和脚本名称

while (args.length !== 0) {
    const option = args.shift()
    if (!_handle_option(option)) {
        throw new Error(`Unknown option: ${option}`)
    }
}

//-----------------------------------------------------------------------------
// detect platform and toolchains
//

// envs toolchain
{
    const CC = process.env.CC ?? ""
    const CXX = process.env.CXX ?? ""
    const AS = process.env.AS ?? ""
    const LD = process.env.LD ?? ""
    const AR = process.env.AR ?? ""

    toolchain("envs")
    {
        set_toolset("as", `${CC}`, `${CXX}`, `${AS}`)
        set_toolset("cc", `${CC}`)
        set_toolset("cxx", `${CC}`, `${CXX}`)
        set_toolset("mm", `${CC}`, `${CXX}`)
        set_toolset("mxx", `${CC}`, `${CXX}`)
        set_toolset("ld", `${CXX}`, `${CC}`, `${LD}`)
        set_toolset("sh", `${CXX}`, `${CC}`, `${LD}`)
        set_toolset("ar", `${AR}`)
    }
    toolchain_end()
}

// clang toolchain
toolchain("clang")
{
    set_toolset("as", "clang")
    set_toolset("cc", "clang")
    set_toolset("cxx", "clang", "clang++")
    set_toolset("mm", "clang")
    set_toolset("mxx", "clang", "clang++")
    set_toolset("ld", "clang++", "clang")
    set_toolset("sh", "clang++", "clang")
    set_toolset("ar", "ar")
}
toolchain_end()

// gcc toolchain
toolchain("gcc")
{
    set_toolset("as", "gcc")
    set_toolset("cc", "gcc")
    set_toolset("cxx", "gcc", "g++")
    set_toolset("mm", "gcc")
    set_toolset("mxx", "gcc", "g++")
    set_toolset("ld", "g++", "gcc")
    set_toolset("sh", "g++", "gcc")
    set_toolset("ar", "ar")
}
toolchain_end()

// mingw toolchain (x86_64)
toolchain("x86_64_w64_mingw32")
{
    set_toolset("as", "x86_64-w64-mingw32-gcc")
    set_toolset("cc", "x86_64-w64-mingw32-gcc")
    set_toolset("cxx", "x86_64-w64-mingw32-gcc", "x86_64-w64-mingw32-g++")
    set_toolset("mm", "x86_64-w64-mingw32-gcc")
    set_toolset("mxx", "x86_64-w64-mingw32-gcc", "x86_64-w64-mingw32-g++")
    set_toolset("ld", "x86_64-w64-mingw32-g++", "x86_64-w64-mingw32-gcc")
    set_toolset("sh", "x86_64-w64-mingw32-g++", "x86_64-w64-mingw32-gcc")
    set_toolset("ar", "x86_64-w64-mingw32-ar", "ar")
}
toolchain_end()

// mingw toolchain (i686)
toolchain("i686_w64_mingw32")
{
    set_toolset("as", "i686-w64-mingw32-gcc")
    set_toolset("cc", "i686-w64-mingw32-gcc")
    set_toolset("cxx", "i686-w64-mingw32-gcc", "i686-w64-mingw32-g++")
    set_toolset("mm", "i686-w64-mingw32-gcc")
    set_toolset("mxx", "i686-w64-mingw32-gcc", "i686-w64-mingw32-g++")
    set_toolset("ld", "i686-w64-mingw32-g++", "i686-w64-mingw32-gcc")
    set_toolset("sh", "i686-w64-mingw32-g++", "i686-w64-mingw32-gcc")
    set_toolset("ar", "i686-w64-mingw32-ar", "ar")
}
toolchain_end()

const _check_platform = () => {
    _target_plat = _target_plat || _target_plat_default
    _target_arch = _target_arch || _target_arch_default
    _target_mode = _target_mode || _target_mode_default

    console.log(`checking for platform ... ${_target_plat}`)
    console.log(`checking for architecture ... ${_target_arch}`)
}

const _toolchain_compcmd_for_gcc_clang = (program: string, objectfile: string, sourcefile: string, flags: string) => {
    return `${program} -c ${flags} -o ${objectfile} ${sourcefile}`
}

const _toolchain_linkcmd_for_gcc_clang = (toolkind: string, program: string, binaryfile: string, objectfiles: string, flags: string) => {
    if (test_eq(toolkind, "sh")) {
        flags = "-shared -fPIC ${flags}"
    }
    return `${program} -o ${binaryfile} ${objectfiles} ${flags}`
}

const _toolchain_linkcmd_for_ar = (toolkind: string, program: string, binaryfile: string, objectfiles: string, flags: string) => {
    return `${program} ${flags} ${binaryfile} ${objectfiles}`
}

const _toolchain_compcmd = (sourcekind: string, objectfile: string, sourcefile: string, flags: string) => {
    const program = _get_toolchain_toolset(_target_toolchain, sourcekind)
    const toolname = path_toolname(program)
    let compcmd = ""
    switch (toolname) {
        case "gcc":
            compcmd = _toolchain_compcmd_for_gcc_clang(program, objectfile, sourcefile, flags)
            break
        case "gxx":
            compcmd = _toolchain_compcmd_for_gcc_clang(program, objectfile, sourcefile, flags)
            break
        case "clang":
            compcmd = _toolchain_compcmd_for_gcc_clang(program, objectfile, sourcefile, flags)
            break
        case "clangxx":
            compcmd = _toolchain_compcmd_for_gcc_clang(program, objectfile, sourcefile, flags)
            break
        default:
            throw new Error(`unknown toolname(${toolname})!`)
    }
    return compcmd
}

const _toolchain_linkcmd = (toolkind: string, binaryfile: string, objectfiles: string, flags: string) => {
    const program = _get_toolchain_toolset(_target_toolchain, toolkind)
    const toolname = path_toolname(program)
    let linkcmd = ""
    switch (toolname) {
        case "gcc":
            linkcmd = _toolchain_linkcmd_for_gcc_clang(toolkind, program, binaryfile, objectfiles, flags)
            break
        case "gxx":
            linkcmd = _toolchain_linkcmd_for_gcc_clang(toolkind, program, binaryfile, objectfiles, flags)
            break
        case "clang":
            linkcmd = _toolchain_linkcmd_for_gcc_clang(toolkind, program, binaryfile, objectfiles, flags)
            break
        case "clangxx":
            linkcmd = _toolchain_linkcmd_for_gcc_clang(toolkind, program, binaryfile, objectfiles, flags)
            break
        case "ar":
            linkcmd = _toolchain_linkcmd_for_ar(toolkind, program, binaryfile, objectfiles, flags)
            break
        default:
            raise(`unknown toolname(${toolname})!`)
            break
    }
    return linkcmd
}

const _toolchain_try_make = (program: string) => {
    return _os_runv(program, "--version")
}

const _toolchain_try_ninja = (program: string) => {
    return _os_runv(program, "--version")
}

let _toolchain_try_gcc_result = ""
const _toolchain_try_gcc = (kind: string, program: string) => {
    if (_toolchain_try_gcc_result === "ok") {
        return true
    } else if (_toolchain_try_gcc_result === "no") {
        return false
    }
    if (_os_runv(program, "--version")) {
        _toolchain_try_gcc_result = "ok"
        return true
    }
    _toolchain_try_gcc_result = "no"
    return false
}

let _toolchain_try_gxx_result = ""
// try g++
function _toolchain_try_gxx(kind: string, program: string) {
    if (_toolchain_try_gxx_result === "ok") {
        return true
    } else if (_toolchain_try_gxx_result === "no") {
        return false
    }
    if (_os_runv(`${program} --version`)) {
        _toolchain_try_gxx_result = "ok"
        return true
    }
    _toolchain_try_gxx_result = "no"
    return false
}

let _toolchain_try_clang_result = ""
// try clang
function _toolchain_try_clang(kind: string, program: string) {
    if (_toolchain_try_clang_result === "ok") {
        return true
    } else if (_toolchain_try_clang_result === "no") {
        return false
    }

    if (_os_runv(`${program} --version`)) {
        _toolchain_try_clang_result = "ok"
        return true
    }
    _toolchain_try_clang_result = "no"
    return false
}

let _toolchain_try_clangxx_result = ""

// try clang++
function _toolchain_try_clangxx(kind: string, program: string) {
    if (_toolchain_try_clangxx_result === "ok") {
        return true
    } else if (_toolchain_try_clangxx_result === "no") {
        return false
    }
    if (_os_runv(`${program} --version`)) {
        _toolchain_try_clangxx_result = "ok"
        return true
    }
    _toolchain_try_clangxx_result = "no"
    return false
}

const _toolchain_try_ar = (kind: string, program: string) => {
    // generate the source file
    let tmpfile = _os_tmpfile()
    let objectfile = `${tmpfile}.o`
    let libraryfile = `${tmpfile}.a`
    fs.writeFileSync(objectfile, "")

    // try linking it
    let ok = _os_runv(program, "-cr", libraryfile, objectfile)

    // remove files
    _os_tryrm(objectfile)
    _os_tryrm(libraryfile)
    return ok
}

const _toolchain_try_program = (toolchain: string, kind: string, program: string) => {
    let ok = false
    let toolname = path_toolname(program)
    switch (toolname) {
        case "gcc":
            _toolchain_try_gcc(kind, program) && (ok = true)
            break
        case "gxx":
            _toolchain_try_gxx(kind, program) && (ok = true)
            break
        case "clang":
            _toolchain_try_clang(kind, program) && (ok = true)
            break
        case "clangxx":
            _toolchain_try_clangxx(kind, program) && (ok = true)
            break
        case "ar":
            _toolchain_try_ar(kind, program) && (ok = true)
            break
        default:
            raise("unknown toolname(" + toolname + ")!")
            break
    }
    if (ok) {
        vprint(`checking for ${program} ... ok`)
        return true
    }
    vprint(`checking for ${program} ... no`)
    return false
}

const _toolchain_try_toolset = (toolchain: string, kind: string, description: string) => {
    const indices = [0, 1, 2, 3, 4, 5]
    for (let idx of indices) {
        let key = kind
        if (idx !== 0) key = `${key}_${idx}`

        let program = _get_toolchain_toolset(toolchain, key)

        if (test_nz(program)) {
            if (_toolchain_try_program(toolchain, kind, program)) {
                _set_toolchain_toolset(toolchain, kind, program)
                console.log(`checking for the ${description} (${kind}) ... ${program}`)
                return true
            }
        }
    }
    return false
}

// try toolchain
function _toolchain_try(toolchain: string) {
    vprint(`checking for ${toolchain} toolchain ...`)
    if (
        _toolchain_try_toolset(toolchain, "cc", "c compiler") &&
        _toolchain_try_toolset(toolchain, "cxx", "c++ compiler") &&
        _toolchain_try_toolset(toolchain, "as", "assembler") &&
        _toolchain_try_toolset(toolchain, "mm", "objc compiler") &&
        _toolchain_try_toolset(toolchain, "mxx", "objc++ compiler") &&
        _toolchain_try_toolset(toolchain, "ld", "linker") &&
        _toolchain_try_toolset(toolchain, "ar", "static library archiver") &&
        _toolchain_try_toolset(toolchain, "sh", "shared library linker")
    ) {
        return true
    }
    return false
}

// detect make
function _toolchain_detect_make() {
    _make_program = _make_program ?? _make_program_default

    if (_toolchain_try_make(_make_program)) {
        console.log("checking for make ... ok")
    } else {
        console.log("checking for make ... no")
        raise("make not found!")
    }
}

// detect ninja
function _toolchain_detect_ninja() {
    _ninja_program = _ninja_program ?? _ninja_program_default

    if (_toolchain_try_ninja(_ninja_program)) {
        console.log("checking for ninja ... ok")
    } else {
        console.log("checking for ninja ... no")
        raise("ninja not found!")
    }
}

// detect build backend
function _toolchain_detect_backend() {
    if (_project_generator === "gmake") {
        _toolchain_detect_make()
    } else if (_project_generator === "ninja") {
        _toolchain_detect_ninja()
    }
}

// detect toolchain
function _toolchain_detect(toolchains: string) {
    // detect build backend
    _toolchain_detect_backend()
    // detect toolchains
    if (test_z(toolchains)) {
        if (is_plat("macosx")) {
            toolchains = "envs clang gcc"
        } else if (is_plat("mingw")) {
            if (is_arch("i386")) toolchains = "i686_w64_mingw32"
            else toolchains = "x86_64_w64_mingw32"
        } else {
            toolchains = "envs gcc clang"
        }
    }

    for (const toolchain of toolchains.split(" ")) {
        if (_toolchain_try(toolchain)) {
            _target_toolchain = toolchain
            break
        }
    }
}

const _check_toolchain = () => {
    const toolchain = _target_toolchain
    _target_toolchain = ""

    _toolchain_detect(toolchain)

    if (test_nz(_target_toolchain)) {
        console.log(`checking for toolchain ... ${_target_toolchain}`)
    } else {
        console.log("checking for toolchain ... no")
        throw new Error("toolchain not found!")
    }
}

const _get_funccode = (func: string) => {
    let code = ""
    if (string_contains(func, "(")) {
        code = func
    } else {
        code = `volatile void* p${func} = (void*)&${func};`
    }
    return code
}

// 生成cxsnippets源代码
function _generate_cxsnippets_sourcecode(funcs: string, includes: string, types: string, snippets: string) {
    let snippet_includes = ""
    for (let include of string_to_array(includes)) {
        snippet_includes = `${snippet_includes}#include "${include}"\n`
    }

    let snippet_types = ""
    for (let type of string_to_array(types)) {
        let typevar = string_replace(type, new RegExp("[^a-zA-Z]", "g"), "_")
        snippet_types = `${snippet_types}typedef ${type} __type_${typevar};\n`
    }

    let snippet_funcs = ""
    for (let func of string_to_array(funcs)) {
        func = _get_funccode(func)
        snippet_funcs = `${snippet_funcs}${func}\n`
    }

    let snippets_code = ""
    if (test_nz(snippet_includes)) {
        snippets_code = `${snippets_code}${snippet_includes}\n`
    }
    if (test_nz(snippet_types)) {
        snippets_code = `${snippets_code}${snippet_types}\n`
    }
    if (test_nz(snippets)) {
        snippets_code = `${snippets_code}${snippets}\n`
    }

    return `${snippets_code}int main(int argc, char** argv) {
    ${snippet_funcs}
    return 0;
}`
}

// check cxsnippets
function _check_cxsnippets(name: string, kind: string) {
    const funcs = _get_option_item(name, `${kind}funcs`)
    const includes = _get_option_item(name, `${kind}includes`)
    const types = _get_option_item(name, `${kind}types`)
    const snippets = _get_option_item(name, `${kind}snippets`)
    let links = _get_option_item(name, "links")
    const syslinks = _get_option_item(name, "syslinks")

    if (test_z(funcs) && test_z(includes) && test_z(types) && test_z(snippets)) {
        return false
    }
    if (test_nz(syslinks)) {
        links += `${syslinks}`
    }

    // get c/c++ extension
    let extension = ".c"
    let sourcekind = "cc"
    if (test_eq(kind, "cxx")) {
        extension = ".cpp"
        sourcekind = "cxx"
    }

    // generate source code
    const sourcecode = _generate_cxsnippets_sourcecode(funcs ?? "", includes, types ?? "", snippets)
    dprint(sourcecode)

    // generate the source file
    const tmpfile = _os_tmpfile()
    const sourcefile = `${tmpfile}${extension}`
    const objectfile = `${tmpfile}.o`
    const binaryfile = `${tmpfile}.bin`
    fs.writeFileSync(sourcefile, sourcecode)

    // try compiling it
    let ok = false
    if (!ok) {
        let compflags = ""
        const program = _get_toolchain_toolset(_target_toolchain, sourcekind)
        const toolname = path_toolname(program)
        const itemnames = ["languages", "warnings", "optimizes", "defines", "undefines"]
        for (const itemname of itemnames) {
            let flags = _get_option_abstract_flags(name, sourcekind, toolname, itemname)
            if (test_nz(flags)) {
                flags = _split_flags(flags)
                compflags += ` ${flags}`
            }
        }
        let flagnames = "cxflags"
        if (test_eq(sourcekind, "cxx")) {
            flagnames += " cxxflags"
        } else {
            flagnames += " cflags"
        }
        for (const flagname of flagnames.split(" ")) {
            const flags = _get_option_item(name, flagname)
            if (test_nz(flags)) {
                compflags += ` ${flags}`
            }
        }
        const compcmd = _toolchain_compcmd(sourcekind, objectfile, sourcefile, compflags)
        if (xmake_sh_diagnosis) {
            print(`> ${compcmd}`)
        }
        if (_os_runv(compcmd)) {
            ok = true
        }
    }

    // try linking it
    if (ok && test_nz(links)) {
        const toolkind = "ld"
        const program = _get_toolchain_toolset(_target_toolchain, toolkind)
        const toolname = path_toolname(program)
        const itemnames = ["linkdirs", "links", "syslinks"]
        let linkflags = ""
        for (const itemname of itemnames) {
            const flags = _get_option_abstract_flags(name, toolkind, toolname, itemname)
            if (test_nz(flags)) {
                linkflags = `${linkflags} ${flags}`
            }
        }
        let flags = _get_option_item(name, "ldflags")
        if (test_nz(flags)) {
            flags = _split_flags(flags)
            linkflags = `${linkflags} ${flags}`
        }
        const linkcmd = _toolchain_linkcmd(toolkind, binaryfile, objectfile, linkflags)
        if (xmake_sh_diagnosis) {
            print(`> ${linkcmd}`)
        }
        if (_os_runv(linkcmd)) {
            ok = true
        } else {
            ok = false
        }
    }

    // trace
    if (xmake_sh_verbose || xmake_sh_diagnosis) {
        if (test_nz(includes)) {
            print(`> checking for ${kind} includes(${includes})`)
        }
        if (test_nz(types)) {
            print(`> checking for ${kind} types(${types})`)
        }
        if (test_nz(funcs)) {
            print(`> checking for ${kind} funcs(${funcs})`)
        }
        if (test_nz(links)) {
            print(`> checking for ${kind} links(${links})`)
        }
    }

    // remove files
    _os_tryrm(sourcefile)
    _os_tryrm(objectfile)
    _os_tryrm(binaryfile)

    return ok
}

const _check_csnippets = (name: string) => {
    return _check_cxsnippets(name, "c")
}

const _check_cxxsnippets = (name: string) => {
    return _check_cxsnippets(name, "cxx")
}

const _check_option = (name: string) => {
    return _check_csnippets(name) && _check_cxxsnippets(name)
}

const _check_options = () => {
    const options = _get_options_for_checking()
    for (const name of string_to_array(options)) {
        if (_check_option(name)) {
            console.log(`checking for ${name} .. ok`)
            _set_option_value(name, true)
        } else {
            console.log(`checking for ${name} .. no`)
            _set_option_value(name, false)
        }
    }
}

const _check_all = () => {
    _check_platform()
    _check_toolchain()
    _check_options()
}
_check_all()

// 初始化内置变量，例如add_headerfiles "${buildir}/config.h"
projectdir = xmake_sh_projectdir

if (path_is_absolute(xmake_sh_buildir)) {
    buildir = xmake_sh_buildir
} else {
    buildir = path_join(xmake_sh_projectdir, xmake_sh_buildir)
}

const plat = _target_plat
const arch = _target_arch
const mode = _target_mode

// 加载项目目标
const _load_targets = () => {
    _loading_options = false
    _loading_toolchains = false
    _loading_targets = true
    _xmake_sh_option_current = ""
    _xmake_sh_target_current = ""
    _xmake_sh_toolchain_current = ""
    const file = path_join(xmake_sh_projectdir, "xmake.js")
    if (fs.existsSync(file)) {
        includes(file)
    } else {
        // include all xmake.js files in next sub-directories
        const files = _os_find(`${xmake_sh_projectdir}`, "xmake.js", 2)
        files.forEach((file) => {
            includes(file)
        })
    }
}

_load_targets()

// get toolset kinds for all targets
// e.g. cc cxx as mm mxx ld sh ar
function _get_targets_toolkinds() {
    if (test_z(_targets_toolkinds_dedup)) {
        _targets_toolkinds_dedup = _dedup(_targets_toolkinds)
    }

    return _targets_toolkinds_dedup
}

// 生成configfiles
// vprint config variable in `${name}`
function _vprint_configvar_value(name: string, value: any) {
    vprint(`  > replace ${name} -> ${value}`)
}

// vprint config variable in `${define name}`
function _vprint_configvar_define(name: string, value: any) {
    if (test_z(value)) {
        vprint(`  > replace ${name} -> /* #undef ${name} */`)
    } else if (test_eq(value, "1") || test_eq(value, "true")) {
        vprint(`  > replace ${name} -> #define ${name} 1`)
    } else if (test_eq(value, "0") || test_eq(value, "false")) {
        vprint(`  > replace ${name} -> #define ${name} 0`)
    } else {
        vprint(`  > replace ${name} -> #define ${name} ${value}`)
    }
}

const _replace_configvar_define = (name: string, value: string): [string | RegExp, string] => {
    let patterns: [string | RegExp, string]
    if (test_z(value)) {
        patterns = [`\${define ${name}}`, `/*#undef ${name}*/`]
    } else if (test_eq(value, "1") || test_eq(value, "true")) {
        patterns = [`\${define ${name}}`, `#define ${name} 1`]
    } else if (test_eq(value, "0") || test_eq(value, "false")) {
        patterns = [`\${define ${name}}`, `/*#define ${name} 0*/`]
    } else {
        patterns = [`\${define ${name}}`, `#define ${name} ${value}`]
    }
    return patterns
}

const _replace_configvar_value = (name: string, value: string): [string | RegExp, string] => {
    return [`\${${name}}`, value]
}

// 生成给定目标的configfile
function _generate_configfile(target: string, configfile_in: string) {
    let configdir = _get_target_item(target, "configdir")
    if (test_z(configdir)) {
        configdir = path_directory(configfile_in)
    }
    if (!fs.existsSync(configdir)) {
        fs.mkdirpSync(configdir)
    }
    const filename = path_basename(configfile_in)
    const configfile = path_join(configdir, filename)
    console.log(`generating ${configfile} ..`)

    let patterns: [string | RegExp, string][] = []
    let target_os = ""
    if (is_plat("mingw")) target_os = "windows"
    else target_os = _target_plat

    target_os = string_toupper(target_os)
    _vprint_configvar_value("OS", target_os)
    patterns.push(_replace_configvar_value("OS", target_os))

    const version = _get_target_item(target, "version")
    let version_build = _get_target_item(target, "version_build")
    const [version_major, version_minor, version_alter] = string_split(version, ".")
    if (test_nz(version)) {
        _vprint_configvar_value("VERSION", version)
        patterns.push(_replace_configvar_value("VERSION", version))
    }
    if (test_nz(version_major)) {
        _vprint_configvar_value("VERSION_MAJOR", version_major)
        patterns.push(_replace_configvar_value("VERSION_MAJOR", version_major))
    }
    if (test_nz(version_minor)) {
        _vprint_configvar_value("VERSION_MINOR", version_minor)
        patterns.push(_replace_configvar_value("VERSION_MINOR", version_minor))
    }
    if (test_nz(version_alter)) {
        _vprint_configvar_value("VERSION_ALTER", version_alter)
        patterns.push(_replace_configvar_value("VERSION_ALTER", version_alter))
    }
    if (test_nz(version_build)) {
        version_build = _os_date(version_build)
        _vprint_configvar_value("VERSION_BUILD", version_build)
        patterns.push(_replace_configvar_value("VERSION_BUILD", version_build))
    }

    let content = fs.readFileSync(configfile_in, "utf8")

    // replace git variables

    if (string_contains(content, "GIT_")) {
        const git_tag = _os_iorunv("git", "describe", "--tags")
        if (test_nz(git_tag)) {
            _vprint_configvar_value("GIT_TAG", git_tag)
            patterns.push(_replace_configvar_value("GIT_TAG", git_tag))
        }
        const git_tag_long = _os_iorunv("git", "describe", "--tags", "--long")
        if (test_nz(git_tag_long)) {
            _vprint_configvar_value("GIT_TAG_LONG", git_tag_long)
            patterns.push(_replace_configvar_value("GIT_TAG_LONG", git_tag_long))
        }
        const git_branch = _os_iorunv("git", "rev-parse", "--abbrev-ref", "HEAD")
        if (test_nz(git_branch)) {
            _vprint_configvar_value("GIT_BRANCH", git_branch)
            patterns.push(_replace_configvar_value("GIT_BRANCH", git_branch))
        }
        const git_commit = _os_iorunv("git", "rev-parse", "--short", "HEAD")
        if (test_nz(git_commit)) {
            _vprint_configvar_value("GIT_COMMIT", git_commit)
            patterns.push(_replace_configvar_value("GIT_COMMIT", git_commit))
        }

        const git_commit_long = _os_iorunv("git", "rev-parse", "HEAD")
        if (test_nz(git_commit_long)) {
            _vprint_configvar_value("GIT_COMMIT_LONG", git_commit_long)
            patterns.push(_replace_configvar_value("GIT_COMMIT_LONG", git_commit_long))
        }
        const git_commit_date = _os_iorunv("log", "-1", "--date=format:%Y%m%d%H%M%S", "--format=%ad")
        if (test_nz(git_commit_date)) {
            _vprint_configvar_value("GIT_COMMIT_DATE", git_commit_date)
            patterns.push(_replace_configvar_value("GIT_COMMIT_DATE", git_commit_date))
        }
    }

    // 替换目标中的配置变量
    let configvars = _get_target_item(target, "configvars") ?? ""
    for (let name of string_to_array(configvars)) {
        let value = _get_target_item(target, `configvar_${name}`)
        _vprint_configvar_define(name, value)
        _vprint_configvar_value(name, value)
        patterns.push(_replace_configvar_define(name, value))
        patterns.push(_replace_configvar_value(name, value))
    }

    if (patterns.length > 0) {
        content = _io_replace_file(content, configfile, patterns)
    }

    content = _io_replace_file(content, configfile, [[new RegExp("${define (.*)}", "g"), `/*#undef $1*/`]])
    // done
    fs.writeFileSync(configfile, content)
    console.log(`${configfile} is generated!`)
}

// generate configfiles
function _generate_configfiles() {
    for (const target of string_to_array(_xmake_sh_targets)) {
        const configfiles = _get_target_item(target, "configfiles") ?? ""
        for (const configfile of string_to_array(configfiles)) {
            _generate_configfile(target, configfile)
        }
    }
}
_generate_configfiles()

//-----------------------------------------------------------------------------
// generate gmake file
//

function _gmake_begin() {
    console.log("generating makefile ..")
}

function _gmake_add_header() {
    fs.writeFileSync(
        xmake_sh_makefile,
        `# this is the build file for this project
# it is autogenerated by the xmake.js build system.
# do not edit by hand.

`,
        { encoding: "utf8" }
    )
}

function _gmake_add_switches() {
    fs.appendFileSync(
        xmake_sh_makefile,
        `ifneq (\$(VERBOSE),1)
V=@
endif

`,
        { encoding: "utf8" }
    )
}

function _gmake_add_flags() {
    const kinds = _get_targets_toolkinds()
    for (const target of string_to_array(_xmake_sh_targets)) {
        for (const kind of string_to_array(kinds)) {
            const flags = _get_target_flags(target, kind)
            const flagname = _get_flagname(kind)
            fs.appendFileSync(xmake_sh_makefile, `${target}_${flagname}=${flags}\n`, { encoding: "utf8" })
        }
        fs.appendFileSync(xmake_sh_makefile, "\n", { encoding: "utf8" })
    }
}

function _gmake_add_toolchains() {
    const kinds = _get_targets_toolkinds()
    for (const kind of string_to_array(kinds)) {
        const program = _get_toolchain_toolset(_target_toolchain, kind)
        fs.appendFileSync(xmake_sh_makefile, `${kind}=${program}\n`, {
            encoding: "utf8",
        })
    }
    fs.appendFileSync(xmake_sh_makefile, "\n", { encoding: "utf8" })
}

const _gmake_add_build_object_for_gcc_clang = (kind: string, sourcefile: string, objectfile: string, flagname: string) => {
    const objectdir = path_directory(objectfile)
    fs.appendFileSync(xmake_sh_makefile, `\t@mkdir -p ${objectdir}\n`)
    fs.appendFileSync(xmake_sh_makefile, `\t$(V)$(${kind}) -c $(${flagname}) -o ${objectfile} ${sourcefile}\n`)
}

const _gmake_add_build_object = (target: string, sourcefile: string, objectfile: string) => {
    const sourcekind = path_sourcekind(sourcefile)
    const program = _get_toolchain_toolset(_target_toolchain, sourcekind)
    const toolname = path_toolname(program)
    let flagname = _get_flagname(sourcekind)
    flagname = `${target}_${flagname}`
    fs.appendFileSync(xmake_sh_makefile, `${objectfile}: ${sourcefile}\n`)
    fs.appendFileSync(xmake_sh_makefile, `\t@echo compiling.${_target_mode} ${sourcefile}\n`)
    switch (toolname) {
        case "gcc":
            _gmake_add_build_object_for_gcc_clang(sourcekind, sourcefile, objectfile, flagname)
            break
        case "gxx":
            _gmake_add_build_object_for_gcc_clang(sourcekind, sourcefile, objectfile, flagname)
            break
        case "clang":
            _gmake_add_build_object_for_gcc_clang(sourcekind, sourcefile, objectfile, flagname)
            break
        case "clangxx":
            _gmake_add_build_object_for_gcc_clang(sourcekind, sourcefile, objectfile, flagname)
            break
        default:
            raise("unknown toolname(${toolname})!")
    }
    fs.appendFileSync(xmake_sh_makefile, "\n")
}

const _gmake_add_build_objects = (target: string) => {
    const sourcefiles = _get_target_sourcefiles(target)
    for (const sourcefile of sourcefiles.split(" ")) {
        const objectfile = _get_target_objectfile(target, sourcefile)
        _gmake_add_build_object(target, sourcefile, objectfile)
    }
}

const _gmake_add_build_target_for_gcc_clang = (kind: string, targetfile: string, objectfiles: string, flagname: string) => {
    const targetdir = path_directory(targetfile)
    fs.appendFileSync(xmake_sh_makefile, `\t@mkdir -p ${targetdir}\n`)
    fs.appendFileSync(xmake_sh_makefile, `\t$(V)$(${kind}) -o ${targetfile} ${objectfiles} $(${flagname})\n`)
}

const _gmake_add_build_target_for_ar = (kind: string, targetfile: string, objectfiles: string, flagname: string) => {
    const targetdir = path_directory(targetfile)
    fs.appendFileSync(xmake_sh_makefile, `\t@mkdir -p ${targetdir}\n`)
    fs.appendFileSync(xmake_sh_makefile, `\t$(V)$(${kind}) $(${flagname}) ${targetfile} ${objectfiles}\n`)
}

function _gmake_add_build_target(target: string) {
    const targetdir = _get_targetdir(target)
    const targetfile = _get_target_file(target)
    const deps = _get_target_item(target, "deps") ?? ""
    const objectfiles = _get_target_objectfiles(target)

    // get linker
    const targetkind = _get_target_item(target, "kind")
    let toolkind = ""
    switch (targetkind) {
        case "binary":
            toolkind = "ld"
            break
        case "static":
            toolkind = "ar"
            break
        case "shared":
            toolkind = "sh"
            break
        default:
            raise("unknown targetkind(" + targetkind + ")!")
            break
    }
    const program = _get_toolchain_toolset(_target_toolchain, toolkind)
    const toolname = path_toolname(program)

    // get linker flags
    let flagname = _get_flagname(toolkind)
    flagname = target + "_" + flagname

    const depfiles = string_to_array(deps)
        .map((dep) => _get_target_file(dep))
        .filter((depfile) => test_nz(depfile))
        .join(" ")

    // link target
    fs.appendFileSync(xmake_sh_makefile, `${target}: ${targetfile}\n`)
    fs.appendFileSync(xmake_sh_makefile, `${targetfile}: ${depfiles} ${objectfiles}\n`)
    fs.appendFileSync(xmake_sh_makefile, `\t@echo linking.${_target_mode} ${targetfile}\n`)
    switch (toolname) {
        case "gcc":
            _gmake_add_build_target_for_gcc_clang(toolkind, targetfile, objectfiles, flagname)
            break
        case "gxx":
            _gmake_add_build_target_for_gcc_clang(toolkind, targetfile, objectfiles, flagname)
            break
        case "clang":
            _gmake_add_build_target_for_gcc_clang(toolkind, targetfile, objectfiles, flagname)
            break
        case "clangxx":
            _gmake_add_build_target_for_gcc_clang(toolkind, targetfile, objectfiles, flagname)
            break
        case "ar":
            _gmake_add_build_target_for_ar(toolkind, targetfile, objectfiles, flagname)
            break
        default:
            raise("unknown toolname(" + toolname + ")!")
            break
    }
    fs.appendFileSync(xmake_sh_makefile, `\n`)

    // build objects
    _gmake_add_build_objects(target)
}

const _gmake_add_build_targets = () => {
    let defaults = ""
    for (const target of string_to_array(_xmake_sh_targets)) {
        if (_is_target_default(target)) {
            defaults += ` ${target}`
        }
    }
    fs.appendFileSync(xmake_sh_makefile, `default:${defaults}\n`)
    fs.appendFileSync(xmake_sh_makefile, `all:${_xmake_sh_targets}\n`)
    fs.appendFileSync(xmake_sh_makefile, `.PHONY: default all\n`)
    fs.appendFileSync(xmake_sh_makefile, "\n")
    _xmake_sh_targets
        .trim()
        .split(" ")
        .forEach((target) => {
            _gmake_add_build_target(target)
        })
}

const _gmake_add_build = () => {
    _gmake_add_build_targets()
}

const _gmake_add_run_target = (target: string) => {
    const targetfile = _get_target_file(target)
    fs.appendFileSync(xmake_sh_makefile, `\t@${targetfile}\n`)
}

const _gmake_add_run_targets = () => {
    let targets = []
    for (const target of string_to_array(_xmake_sh_targets)) {
        const kind = _get_target_item(target, "kind")
        if (kind === "binary") {
            if (_is_target_default(target)) {
                targets.push(target)
            }
        }
    }
    fs.appendFileSync(xmake_sh_makefile, `run: ${targets.join(" ")}\n`)

    for (const target of targets) {
        _gmake_add_run_target(target)
    }

    fs.appendFileSync(xmake_sh_makefile, `\n`)
}

const _gmake_add_run = () => {
    _gmake_add_run_targets()
}

const _gmake_add_clean_target = (target: string) => {
    const targetfile = _get_target_file(target)
    const objectfiles = _get_target_objectfiles(target)
    fs.appendFileSync(xmake_sh_makefile, `\t@rm ${targetfile}\n`)
    for (const objectfile of objectfiles.split(" ")) {
        fs.appendFileSync(xmake_sh_makefile, `\t@rm ${objectfile}\n`)
    }
}

function _gmake_add_clean_targets() {
    let targets = []
    for (const target of _xmake_sh_targets.trim().split(" ")) {
        if (_is_target_default(target)) {
            targets.push(target)
        }
    }
    fs.appendFileSync(xmake_sh_makefile, `clean: ${targets.join(" ")}\n`)
    for (const target of targets) {
        _gmake_add_clean_target(target)
    }
    fs.appendFileSync(xmake_sh_makefile, "\n")
}

function _gmake_add_clean() {
    _gmake_add_clean_targets()
}

function _gmake_add_install_target(target: string) {
    const targetfile = _get_target_file(target)
    const filename = path_filename(targetfile)
    let installdir = _get_target_item(target, "installdir")
    if (test_z(installdir)) {
        installdir = _install_prefix_default
    }

    // install target file
    const targetkind = _get_target_item(target, "kind")
    if (test_eq(targetkind, "binary")) {
        fs.appendFileSync(xmake_sh_makefile, `\t@mkdir -p ${installdir}/${_install_bindir_default}\n`)
        fs.appendFileSync(xmake_sh_makefile, `\t@cp -p ${targetfile} ${installdir}/${_install_bindir_default}/${filename}\n`)
    } else if (test_eq(targetkind, "static") || test_eq(targetkind, "shared")) {
        fs.appendFileSync(xmake_sh_makefile, `\t@mkdir -p ${installdir}/${_install_libdir_default}\n`)
        fs.appendFileSync(xmake_sh_makefile, `\t@cp -p ${targetfile} ${installdir}/${_install_libdir_default}/${filename}\n`)
    }

    // install header files
    const headerfiles = _get_target_item(target, "headerfiles")
    if (test_nz(headerfiles)) {
        const includedir = path_join(installdir, _install_includedir_default)
        for (let srcheaderfile of string_to_array(headerfiles)) {
            const result = string_split(srcheaderfile, ":")
            const rootdir = result[1]
            const prefixdir = result[2]
            srcheaderfile = result[0]
            let filename = result[3]
            if (test_z(filename)) filename = path_filename(srcheaderfile)
            let dstheaderdir = includedir
            if (test_nz(prefixdir)) {
                dstheaderdir = path_join(dstheaderdir, prefixdir)
            }
            let dstheaderfile = path_join(dstheaderdir, filename)
            if (test_nz(rootdir)) {
                const subfile = path_relative(rootdir, srcheaderfile)
                dstheaderfile = path_join(dstheaderdir, subfile)
            }
            dstheaderdir = path_directory(dstheaderfile)
            fs.appendFileSync(xmake_sh_makefile, `\t@mkdir -p ${dstheaderdir}\n`)
            fs.appendFileSync(xmake_sh_makefile, `\t@cp -p ${srcheaderfile} ${dstheaderfile}\n`)
        }
    }
    // 安装用户文件
    const installfiles = _get_target_item(target, "installfiles")
    if (test_nz(installfiles)) {
        for (let srcinstallfile of string_to_array(installfiles)) {
            const result = string_split(srcinstallfile, ":")

            const rootdir = result[1]
            const prefixdir = result[2]
            srcinstallfile = result[0]
            let filename = result[3]

            if (test_z(filename)) filename = path_filename(srcinstallfile)
            let dstinstalldir = installdir
            if (test_nz(prefixdir)) {
                dstinstalldir = path_join(dstinstalldir, prefixdir)
            }
            let dstinstallfile = path_join(dstinstalldir, filename)
            if (test_nz(rootdir)) {
                const subfile = path_relative(rootdir, srcinstallfile)
                dstinstallfile = path_join(dstinstalldir, subfile)
            }
            dstinstalldir = path_directory(dstinstallfile)
            fs.appendFileSync(xmake_sh_makefile, `\t@mkdir -p ${dstinstalldir}\n`)
            fs.appendFileSync(xmake_sh_makefile, `\t@cp -p ${srcinstallfile} ${dstinstallfile}\n`)
        }
    }
}

const _gmake_add_install_targets = () => {
    let targets = []
    for (const target of string_to_array(_xmake_sh_targets)) {
        if (_is_target_default(target)) {
            targets.push(target)
        }
    }
    fs.appendFileSync(xmake_sh_makefile, `install: ${targets.join(" ")}\n`)
    for (const target of targets) {
        _gmake_add_install_target(target)
    }
    fs.appendFileSync(xmake_sh_makefile, "\n")
}

const _gmake_add_install = () => {
    _gmake_add_install_targets()
}

const _gmake_done = () => {
    console.log("makefile is generated!")
}

const _generate_for_gmake = () => {
    _gmake_begin()
    _gmake_add_header()
    _gmake_add_switches()
    _gmake_add_toolchains()
    _gmake_add_flags()
    _gmake_add_build()
    _gmake_add_clean()
    _gmake_add_install()
    _gmake_add_run()
    _gmake_done()
}

//-----------------------------------------------------------------------------
// generate ninja file
//

// generate build file for ninja
function _generate_for_ninja() {
    throw new Error("Ninja generator has been not supported!")
}

//-----------------------------------------------------------------------------
// generate build file
//

function _generate_build_file() {
    if (_project_generator === "gmake") {
        _generate_for_gmake()
    } else if (_project_generator === "ninja") {
        _generate_for_ninja()
    } else {
        throw new Error(`unknown generator: ${_project_generator}`)
    }
}
_generate_build_file()

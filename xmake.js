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

const fs = require('fs');
const path = require('path');
const child_process = require('child_process');
const util = require('util')
const exec = util.promisify(require('child_process').exec)
const glob = require('glob');

const xmake_sh_projectdir = path.resolve(__dirname);
const xmake_sh_buildir = 'build';
const xmake_sh_version = '1.0.2';
const xmake_sh_verbose = false;
const xmake_sh_diagnosis = false;
const xmake_sh_copyright = 'Copyright (C) 2022-present Ruki Wang, tboox.org, xmake.io.';

let _loading_toolchains
let _xmake_sh_options = []

let _install_prefix_default;
let _install_bindir_default;
let _install_libdir_default;
let _install_includedir_default;

function raise(msg) {
    console.error(msg);
    process.exit(1);
}

function vprint(...msg) {
    if (xmake_sh_verbose) {
        console.log(...msg);
    }
}

function dprint(...msg) {
    if (xmake_sh_diagnosis) {
        console.log(...msg);
    }
}

function print(...msg) {
    console.log(...msg);
}

const _test_z = (str) => {
    if (`x${str}` === 'x') {
        return true;
    }
    return false;
}

const _test_nz = (str) => {
    if (`x${str}` !== 'x') {
        return true;
    }
    return false;
}

const _test_eq = (str1, str2) => {
    if (`x${str1}` === `x${str2}`) {
        return true;
    }
    return false;
}

const _test_nq = (str1, str2) => {
    if (`x${str1}` !== `x${str2}`) {
        return true;
    }
    return false;
}

function string_toupper(str) {
    return str.toUpperCase();
}

function string_tolower(str) {
    return str.toLowerCase();
}

function string_replace(str, pattern, replacement) {
    return str.replace(pattern, replacement);
}

function string_split(str, sep, idx) {
    return str.split(sep)[idx];
}

function string_contains(str, substr) {
    return str.indexOf(substr) !== -1 ? 0 : 1;
}

// does startswith sub-string?
// e.g.
// str="src/*.cpp"
// string_startswith(str, "src")
function string_startswith(str, subStr) {
    if (str.startsWith(subStr)) {
        return 0;
    }
    return 1;
}

// duplicate characters
// e.g. string_dupch(10, ".") => ...........
function string_dupch(count, ch) {
    let result = '';
    for (let i = 0; i < count; ++i) {
        result += ch;
    }
    return result;
}

// try remove file or directory
function _os_tryrm(path) {
    if (fs.existsSync(path)) {
        if (fs.lstatSync(path).isDirectory()) {
            fs.rmdirSync(path);
        } else {
            fs.unlinkSync(path);
        }
    }
}

// get temporary file
function _os_tmpfile() {
    return tmp.fileSync().name;
}

// try run program
function _os_runv(...cmd) {
    let ok = 0;
    if (xmake_sh_diagnosis) {
        ok = execSync(cmd.join(' '));
    } else {
        ok = execSync(cmd.join(' '), { stdio: 'ignore' });
    }
    if (ok !== 0) {
        return 1;
    }
    return 0;
}

// try run program and get output
function _os_iorunv(...cmd) {
    let tmpfile = _os_tmpfile();
    let ok = 0;
    let result = '';
    try {
        result = execSync(cmd.join(' ') + ` > ${tmpfile} 2>&1`);
    } catch (error) {
        ok = 1;
    }
    if (ok !== 0) {
        return '';
    }
    result = fs.readFileSync(tmpfile, 'utf8');
    _os_tryrm(tmpfile);
    return result;
}



// find file in the given directory
// e.g. _os_find . xmake.sh
function _os_find(dir, name, depth) {
    if (depth) {
        if (is_host('macosx')) {
            return `find ${dir} -depth ${depth} -name "${name}"`;
        } else {
            return `find ${dir} -maxdepth ${depth} -mindepth ${depth} -name "${name}"`;
        }
    } else {
        return `find ${dir} -name "${name}"`;
    }
}

// get date, "%Y%m%d%H%M" -> 202212072222
function _os_date(format) {
    const date = new Date();
    return date.toISOString().replace('T', ' ').replace(/\.[0-9]{3}Z$/, '');
}

function path_filename(path) {
    const filename = path.split('/').pop();
    return filename;
}

function path_extension(path) {
    const filename = path_filename(path);
    const extension = filename.split('.').pop();
    return `.${extension}`;
}

function path_basename(path) {
    const filename = path_filename(path);
    const basename = filename.replace(/\.[^/.]+$/, '');
    return basename;
}

function path_directory(path) {
    const dirname = path.split('/').slice(0, -1).join('/');
    return dirname;
}

function path_is_absolute(str) {
    if (string_startswith(str, "/")) {
        return 0;
    }
    return 1;
}

function path_relative(source, target) {
    let common_part = source;
    let result = "";

    while (_test_eq(target.substr(common_part), target)) {
        // no match, means that candidate common part is not correct
        // go up one level (reduce common part)
        common_part = path.dirname(common_part);
        // and record that we went back, with correct / handling
        if (_test_z(result)) {
            result = "..";
        } else {
            result = "../" + result;
        }
    }

    if (_test_eq(common_part, "/")) {
        // special case for root (no common path)
        result = result + "/";
    }

    // since we now have identified the common part,
    // compute the non-common part
    let forward_part = target.substr(common_part);

    // and now stick all parts together
    if (_test_nz(result) && _test_nz(forward_part)) {
        result = result + forward_part;
    } else if (_test_nz(forward_part)) {
        // remote extra '/', e.g. "/xxx" => "xxx"
        result = forward_part.substr(1);
    }

    return result;
}

function path_extensionstring_replace(str, replacement) {
    return str.replace(/\..*/, replacement);
}

function path_sourcekind(file) {
    const extension = path_extension(file);
    let sourcekind = "";
    switch (extension) {
        case ".c":
            sourcekind = "cc";
            break;
        case ".cpp":
            sourcekind = "cxx";
            break;
        case ".cc":
            sourcekind = "cxx";
            break;
        case ".ixx":
            sourcekind = "cxx";
            break;
        case ".m":
            sourcekind = "mm";
            break;
        case ".mxx":
            sourcekind = "mxx";
            break;
        case ".S":
            sourcekind = "as";
            break;
        case ".s":
            sourcekind = "as";
            break;
        case ".asm":
            sourcekind = "as";
            break;
        default:
            throw new Error("unknown sourcekind for " + file);
    }
    return sourcekind;
}


function path_toolname(path) {
    const basename = path_basename(path);
    let toolname = "";
    if (basename.endsWith("-gcc")) {
        toolname = "gcc";
    } else if (basename === "gcc") {
        toolname = "gcc";
    } else if (basename.endsWith("-g++")) {
        toolname = "gxx";
    } else if (basename === "g++") {
        toolname = "gxx";
    } else if (basename.endsWith("-clang++")) {
        toolname = "clangxx";
    } else if (basename === "clang++") {
        toolname = "clangxx";
    } else if (basename.endsWith("-clang")) {
        toolname = "clang";
    } else if (basename === "clang") {
        toolname = "clang";
    } else if (basename.endsWith("-ar")) {
        toolname = "ar";
    } else if (basename === "ar") {
        toolname = "ar";
    } else {
        throw new Error(`unknown tool for ${basename}`);
    }
    return toolname;
}

const _get_flagname = (toolkind) => {
    let flagname = "";
    switch (toolkind) {
        case "cc":
            flagname = "cflags";
            break;
        case "cxx":
            flagname = "cxxflags";
            break;
        case "as":
            flagname = "asflags";
            break;
        case "mm":
            flagname = "mflags";
            break;
        case "mxx":
            flagname = "mxxflags";
            break;
        case "ar":
            flagname = "arflags";
            break;
        case "sh":
            flagname = "shflags";
            break;
        case "ld":
            flagname = "ldflags";
            break;
        default:
            throw new Error("unknown toolkind(" + toolkind + ")!");
    }
    return flagname;
};

function _is_enabled(value) {
    return ["true", "yes", "y"].includes(value);
}
const _map = name => {
    eval(`_map_${name}_count=0`);
    eval(`_map_${name}_keys=""`);
};

const _map_genkey = key => key.replace(/[/*.()+-\$]/g, "");

const _map_count = name => eval(`_map_${name}_count`);

const _map_get = (name, key) => {
    const value = eval(`_map_${name}_value_${key}`);
    if (value === "__empty__") {
        return "";
    }
    return value;
};

const _map_has = (name, key) => {
    const value = eval(`_map_${name}_value_${key}`);
    if (value) {
        return 0;
    }
    return 1;
};

const _map_set = (name, key, value) => {
    if (!_map_has(name, key)) {
        const count = _map_count("options");
        eval(`_map_${name}_count=${count + 1}`);
        let keys = eval(`_map_${name}_keys`);
        keys = `${keys} ${key}`;
        eval(`_map_${name}_keys=${keys}`);
    }
    eval(`_map_${name}_value_${key}=${value}`);
};

const _map_remove = (name, key) => {
    if (_map_has(name, key)) {
        const count = _map_count("options");
        eval(`_map_${name}_count=${count - 1}`);
        eval(`_map_${name}_value_${key}=""`);
        let keys = eval(`_map_${name}_keys`);
        let keys_new = "";
        for (let k of keys) {
            if (k !== key) {
                keys_new = `${keys_new} ${k}`;
            }
        }
        eval(`_map_${name}_keys=${keys_new}`);
    }
};

const _map_keys = name => eval(`_map_${name}_keys`);

let os_host = require('os').hostname().toLowerCase();

if (os_host.includes('cygwin')) {
    os_host = 'cygwin';
}

if (os_host.includes('msys')) {
    os_host = 'msys';
}

if (os_host.includes('mingw')) {
    os_host = 'msys';
}

if (os_host.includes('darwin')) {
    os_host = 'macosx';
}

if (os_host.includes('linux')) {
    os_host = 'linux';
}

if (os_host.includes('freebsd')) {
    os_host = 'freebsd';
}

if (os_host.includes('bsd')) {
    os_host = 'bsd';
}

// determining host
// e.g.
// if is_host("linux", "macosx") {
// ...
// }
function is_host(...hosts) {
    return hosts.includes(os_host);
}
const os = require('os');

// detect host architecture
const os_arch = os.arch().toLowerCase();

// do something with os_arch here

if (os_arch === 'x86') {
    // do something for x86 architecture
} else if (os_arch === 'x64') {
    // do something for x64 architecture
} else {
    // do something for other architectures
}

// set the default target platform and architecture
const _target_plat_default = os_host;
if (is_host("msys")) {
    _target_plat_default = "mingw";
}
const _target_arch_default = os_arch;
const _target_mode_default = "release";

// set the default project generator and build program
let _project_generator = "gmake";
let _make_program_default = "make";
let _ninja_program_default = "ninja";
if (is_host("freebsd", "bsd")) {
    _make_program_default = "gmake";
    _ninja_program_default = "ninja";
} else if (is_host("msys", "cygwin")) {
    _make_program_default = "make.exe";
    _ninja_program_default = "ninja.exe";
}

// set the default directories
if (fs.existsSync('/usr/local')) {
    _install_prefix_default = '/usr/local';
} else if (fs.existsSync('/usr')) {
    _install_prefix_default = '/usr';
}
_install_bindir_default = 'bin';
_install_libdir_default = 'lib';
_install_includedir_default = 'include';


// determining target platform
// e.g.
// if (is_plat("linux", "macosx")) {
//     ...
// }
function is_plat(...plats) {
    for (const plat of plats) {
        if (_target_plat === plat) {
            return true;
        }
    }
    return false;
}

// determining target architecture
// e.g.
// if (is_arch("x86_64", "i386")) {
//     ...
// }
function is_arch(...archs) {
    for (const arch of archs) {
        if (_target_arch === arch) {
            return true;
        }
    }
    return false;
}

// determining target mode
// e.g.
// if (is_mode("release")) {
//     ...
// }
function is_mode(...modes) {
    for (const mode of modes) {
        if (_target_mode === mode) {
            return true;
        }
    }
    return false;
}

// determining target toolchain
// e.g.
// if (is_toolchain("clang")) {
//     ...
// }
function is_toolchain(...toolchains) {
    for (const toolchain of toolchains) {
        if (_target_toolchain === toolchain) {
            return true;
        }
    }
    return false;
}
// set project name
function set_project(name) {
    _xmake_sh_project_name = name
}

// include the given xmake.sh file or directory
// e.g. includes "src" "tests"
function includes(...paths) {
    for (const path of paths) {
        if (fs.existsSync(path) && fs.statSync(path).isFile()) {
            xmake_sh_scriptdir = path.dirname()
            require(path)
        } else {
            const xmake_sh_scriptdir_cur = xmake_sh_scriptdir
            if (xmake_sh_scriptdir !== "") {
                xmake_sh_scriptdir = `${xmake_sh_scriptdir_cur}/${path}`
                require(`${xmake_sh_scriptdir}/xmake.sh`)
            } else {
                require(`${xmake_sh_projectdir}/${path}/xmake.sh`)
            }
            xmake_sh_scriptdir = xmake_sh_scriptdir_cur
        }
    }
}

function _get_abstract_flag_for_gcc_clang(toolkind, toolname, itemname, value) {
    let flag = "";
    switch (itemname) {
        case "defines":
            flag = `-D${value}`;
            break;
        case "udefines":
            flag = `-U${value}`;
            break;
        case "includedirs":
            flag = `-I${value}`;
            break;
        case "linkdirs":
            flag = `-L${value}`;
            break;
        case "links":
            flag = `-l${value}`;
            break;
        case "syslinks":
            flag = `-l${value}`;
            break;
        case "frameworks":
            flag = `-framework ${value}`;
            break;
        case "frameworkdirs":
            flag = `-F${value}`;
            break;
        case "rpathdirs":
            if (toolname === "gcc" || toolname === "gxx") {
                // 在makefile中转义 $ORIGIN，TODO 我们也需要处理ninja
                value = value.replace("@loader_path", "$$ORIGIN");
                flag = `-Wl,-rpath='${value}'`;
            } else if (toolname === "clang" || toolname === "clangxx") {
                value = value.replace("$ORIGIN", "@loader_path");
                flag = `-Xlinker -rpath -Xlinker ${value}`;
            }
            break;
        case "symbols":
            if (value === "debug") {
                flag = "-g";
            } else if (value === "hidden") {
                flag = "-fvisibility=hidden";
            }
            break;
        case "strip":
            if (value === "debug") {
                flag = "-Wl,-S"
            } else if (value === "all") {
                if (is_plat === "macosx") {
                    flag = "-Wl,-x"
                } else {
                    flag = "-s"
                }
            }
            break;
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
            break;
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
            break;
        case 'languages':
            if (toolkind === 'cc' || toolkind === 'mm') {
                switch (value) {
                    case 'ansi':
                        flag = '-ansi';
                        break;
                    case 'c89':
                        flag = '-std=c89';
                        break;
                    case 'gnu89':
                        flag = '-std=gnu89';
                        break;
                    case 'c99':
                        flag = '-std=c99';
                        break;
                    case 'gnu99':
                        flag = '-std=gnu99';
                        break;
                    case 'c11':
                        flag = '-std=c11';
                        break;
                    case 'gnu11':
                        flag = '-std=gnu11';
                        break;
                    case 'c17':
                        flag = '-std=c17';
                        break;
                    case 'gnu17':
                        flag = '-std=gnu17';
                        break;
                }
            } else if (toolkind === 'cxx' || toolkind === 'mxx') {
                switch (value) {
                    case 'cxx98':
                        flag = '-std=c++98';
                        break;
                    case 'c++98':
                        flag = '-std=c++98';
                        break;
                    case 'gnuxx98':
                        flag = '-std=gnu++98';
                        break;
                    case 'gnu++98':
                        flag = '-std=gnu++98';
                        break;

                    case 'cxx11':
                        flag = '-std=c++11';
                        break;
                    case 'c++11':
                        flag = '-std=c++11';
                        break;
                    case 'gnuxx11':
                        flag = '-std=gnu++11';
                        break;
                    case 'gnu++11':
                        flag = '-std=gnu++11';
                        break;

                    case 'cxx14':
                        flag = '-std=c++14';
                        break;
                    case 'c++14':
                        flag = '-std=c++14';
                        break;
                    case 'gnuxx14':
                        flag = '-std=gnu++14';
                        break;
                    case 'gnu++14':
                        flag = '-std=gnu++14';
                        break;

                    case 'cxx17':
                        flag = '-std=c++17';
                        break;
                    case 'c++17':
                        flag = '-std=c++17';
                        break;
                    case 'gnuxx17':
                        flag = '-std=gnu++17';
                        break;
                    case 'gnu++17':
                        flag = '-std=gnu++17';
                        break;

                    case 'cxx1z':
                        flag = '-std=c++1z';
                        break;
                    case 'c++1z':
                        flag = '-std=c++1z';
                        break;
                    case 'gnuxx1z':
                        flag = '-std=gnu++1z';
                        break;
                    case 'gnu++1z':
                        flag = '-std=gnu++1z';
                        break;

                    case 'cxx2a':
                        flag = '-std=c++2a';
                        break;
                    case 'c++2a':
                        flag = '-std=c++2a';
                        break;
                    case 'gnuxx2a':
                        flag = '-std=gnu++2a';
                        break;
                    case 'gnu++2a':
                        flag = '-std=gnu++2a';
                        break;
                    case "cxx20":
                        flag = "-std=c++20";
                        break;
                    case "c++20":
                        flag = "-std=c++20";
                        break;
                    case "gnuxx20":
                        flag = "-std=gnu++20";
                        break;
                    case "gnu++20":
                        flag = "-std=gnu++20";
                        break;
                    default:
                        if (value.startsWith("cxx")) {
                            throw new Error(`unknown language value(${value})!`);
                        }
                        if (value.startsWith("c++")) {
                            throw new Error(`unknown language value(${value})!`);
                        }
                        break;
                }
            }
            break;
        default:
            throw new Error(`unknown itemname(${itemname})!`);
    }
    return flag;
}


// get abstract flags
const _get_abstract_flags = (toolkind, toolname, itemname, values) => {
    let flags = '';
    for (const value of values.split(' ')) {
        let flag = '';
        switch (toolname) {
            case 'gcc':
            case 'gxx':
            case 'clang':
            case 'clangxx':
                flag = _get_abstract_flag_for_gcc_clang(toolkind, toolname, itemname, value);
                break;
            default:
                throw new Error(`unknown toolname(${toolname})!`);
        }
        if (flag) {
            flags += ` ${flag}`;
        }
    }
    return flags;
}
//-----------------------------------------------------------------------------
// option configuration apis
//

// define option
const option = (name, description, _default) => {
    _xmake_sh_option_current = name;
    if (!_loading_options) {
        return;
    }
    _xmake_sh_options = `${_xmake_sh_options} ${name}`;
    _map_set("options", `${name}_name`, name);
    _map_set("options", `${name}_description`, description);
    _map_set("options", `${name}_default`, _default);
    return 0;
}

const option_end = () => {
    _xmake_sh_option_current = "";
}

_map("options");

// has the given option?
const _has_option = (name) => {
    if (_map_has("options", `${name}_name`)) {
        return 0;
    }
    return 1;
}

// get the given option item
const _get_option_item = (name, key) => {
    const value = _map_get("options", `${name}_${key}`);
    return value;
}

// set the given option item
const _set_option_item = (name, key, value) => {
    if (_test_nz(name)) {
        _map_set("options", `${name}_${key}`, value);
    } else {
        raise(`please call set_${key}(${value}) in the option scope!`);
    }
}

// add values to the given option item
const _add_option_item = (name, key, value) => {
    if (_test_nz(name)) {
        const values = _map_get("options", `${name}_${key}`);
        const newValues = `${values} ${value}`;
        _map_set("options", `${name}_${key}`, newValues);
    } else {
        throw new Error(`please call add_${key}(${value}) in the option scope!`);
    }
};



// get the give option value
function _get_option_value(name) {
    let value = _get_option_item(name, "value");
    if (value === "x") {
        value = _get_option_item(name, "default");
    }
    return value;
}

// set the give option value
function _set_option_value(name, value) {
    _set_option_item(name, "value", value);
}

const _option_need_checking = name => {
    const _default = _get_option_item(name, "default");
    if (_default !== "") {
        return false;
    }

    const cfuncs = _get_option_item(name, "cfuncs");
    const cxxfuncs = _get_option_item(name, "cxxfuncs");
    const cincludes = _get_option_item(name, "cincludes");
    const cxxincludes = _get_option_item(name, "cxxincludes");
    const ctypes = _get_option_item(name, "ctypes");
    const cxxtypes = _get_option_item(name, "cxxtypes");
    const csnippets = _get_option_item(name, "csnippets");
    const cxxsnippets = _get_option_item(name, "cxxsnippets");
    const links = _get_option_item(name, "links");
    const syslinks = _get_option_item(name, "syslinks");

    if (cfuncs || cxxfuncs || cincludes || cxxincludes || ctypes || cxxtypes || csnippets || cxxsnippets || links || syslinks) {
        return true;
    }
    return false;
}

// get options for the help menu
function _get_options_for_menu() {
    let options = "";
    for (const name of _xmake_sh_options) {
        const showmenu = _get_option_item(name, "showmenu");
        if (_is_enabled(showmenu)) {
            options = `${options} ${name}`;
        } else if (!showmenu && !_option_need_checking(name)) {
            options = `${options} ${name}`;
        }
    }
    return options;
}

// get options for checking
function _get_options_for_checking() {
    let options = "";
    for (const name of _xmake_sh_options) {
        const showmenu = _get_option_item(name, "showmenu");
        if (!showmenu && _option_need_checking(name)) {
            options = `${options} ${name}`;
        }
    }
    return options;
}

// get abstract flags in option
function _get_option_abstract_flags(name, toolkind, toolname, itemname, values = '') {
    if (_test_z(values)) {
        values = _get_option_item(name, itemname);
    }
    const flags = _get_abstract_flags(toolkind, toolname, itemname, values);
    return flags;
}

// is config for option
function is_config(name, value) {
    if (!_loading_targets) {
        return false;
    }
    const value_cur = _get_option_value(name);
    return value_cur === value;
}


// has config for option
function has_config(name) {
    if (!_loading_targets) {
        return false;
    }
    let value_cur = _get_option_value(name);
    if (_is_enabled(value_cur)) {
        return true;
    }
    return false;
}

// set showmenu in option
function set_showmenu(show) {
    if (!_loading_options) {
        return;
    }
    _set_option_item(_xmake_sh_option_current, "showmenu", show);
}


// set description in option
function set_description(description) {
    if (!_loading_options) {
        return;
    }
    _set_option_item(_xmake_sh_option_current, "description", description);
}

// add cfuncs in option
function add_cfuncs(cfuncs) {
    if (!_loading_options) {
        return;
    }
    _add_option_item(_xmake_sh_option_current, "cfuncs", cfuncs);
}

// add cxxfuncs in option
function add_cxxfuncs(cxxfuncs) {
    if (!_loading_options) {
        return;
    }
    _add_option_item(_xmake_sh_option_current, "cxxfuncs", cxxfuncs);
}

// add cincludes in option
function add_cincludes(cincludes) {
    if (!_loading_options) {
        return;
    }
    _add_option_item(_xmake_sh_option_current, "cincludes", cincludes);
}

// add cxxincludes in option
function add_cxxincludes(cxxincludes) {
    if (!_loading_options) {
        return;
    }
    _add_option_item(_xmake_sh_option_current, "cxxincludes", cxxincludes);
}

// add ctypes in option
function add_ctypes(ctypes) {
    if (!_loading_options) {
        return;
    }
    _add_option_item(_xmake_sh_option_current, "ctypes", ctypes);
}

// add cxxtypes in option
function add_cxxtypes(cxxtypes) {
    if (!_loading_options) {
        return;
    }
    _add_option_item(_xmake_sh_option_current, "cxxtypes", cxxtypes);
}

// add csnippets in option
function add_csnippets(csnippets) {
    if (!_loading_options) {
        return;
    }
    _add_option_item(_xmake_sh_option_current, "csnippets", csnippets);
}

// add cxxsnippets in option
function add_cxxsnippets(cxxsnippets) {
    if (!_loading_options) {
        return;
    }
    _add_option_item(_xmake_sh_option_current, "cxxsnippets", cxxsnippets);
}

function target(name) {
    _xmake_sh_target_current = name;
    if (!_loading_targets) {
        return;
    }
    _xmake_sh_targets += ` ${name}`;
    _map_set("targets", `${name}_name`, name);
    return 0;
}
function target_end() {
    _xmake_sh_target_current = "";
}
_map("targets");


// has the given target?
function _has_target(name) {
    if (_map_has("targets", name + "_name")) {
        return true;
    }
    return false;
}

// has the given target item
function _has_target_item(name, key) {
    if (_map_has("targets", name + "_" + key) || _map_has("targets", "__root_" + key)) {
        return true;
    }
    return false;
}

// get the given target item
function _get_target_item(name, key) {
    let values = _map_get("targets", name + "_" + key);
    if (_map_has("targets", "__root_" + key)) {
        let root_values = _map_get("targets", "__root_" + key);
        values = root_values + " " + values;
    }
    return values;
}

// set the given target item
function _set_target_item(name, key, value) {
    if (_test_nz(name)) {
        _map_set("targets", name + "_" + key, value);
    } else {
        _map_set("targets", "__root_" + key, value);
    }
}

// add values to the given target item
function add_target_item(name, key, value) {
    if (_test_nz(name)) {
        const values = _map_get("targets", `${name}_${key}`);
        const newValues = `${values} ${value}`;
        _map_set("targets", `${name}_${key}`, newValues);
    } else {
        const values = _map_get("targets", `__root_${key}`);
        const newValues = `${values} ${value}`;
        _map_set("targets", `__root_${key}`, newValues);
    }
}

function _is_target_default(name) {
    if (_has_target_item(name, "default")) {
        const defaultValue = _get_target_item(name, "default");
        if (_is_enabled(defaultValue)) {
            return 0;
        }
        return 1;
    }
    return 0;
}

function _get_target_basename(name) {
    let basename = name;
    if (_has_target_item(name, "basename")) {
        basename = _get_target_item(name, "basename");
    }
    return basename;
}

function _get_target_extension(name) {
    let extension = "";
    if (_has_target_item(name, "extension")) {
        extension = _get_target_item(name, "extension");
    } else if (is_plat("mingw")) {
        const kind = _get_target_item(name, "kind");
        if (kind === "binary") {
            extension = ".exe";
        } else if (kind === "static") {
            extension = ".a";
        } else if (kind === "shared") {
            extension = ".dll";
        }
    } else {
        const kind = _get_target_item(name, "kind");
        if (kind === "static") {
            extension = ".a";
        } else if (kind === "shared") {
            extension = ".so";
        }
    }
    return extension;
}

const _get_target_prefixname = (name) => {
    let prefixname = "";
    if (_has_target_item(name, "prefixname")) {
        prefixname = _get_target_item(name, "prefixname");
    } else if (is_plat("mingw")) {
        let kind = _get_target_item(name, "kind");
        if (kind === "xstatic") {
            prefixname = "lib";
        } else if (kind === "xshared") {
            prefixname = "lib";
        }
    } else {
        let kind = _get_target_item(name, "kind");
        if (kind === "xstatic") {
            prefixname = "lib";
        } else if (kind === "xshared") {
            prefixname = "lib";
        }
    }
    return prefixname;
}

const _get_target_filename = (name) => {
    let filename = "";
    let basename = _get_target_basename(name);
    let extension = _get_target_extension(name);
    let prefixname = _get_target_prefixname(name);
    if (_has_target_item(name, "filename")) {
        filename = _get_target_item(name, "filename");
    } else {
        filename = `${prefixname}${basename}${extension}`;
    }
    return filename;
}

const _get_targetdir = (name) => {
    let targetdir = "";
    if (_has_target_item(name, "targetdir")) {
        targetdir = _get_target_item(name, "targetdir");
    } else {
        targetdir = `${xmake_sh_buildir}/${_target_plat}/${_target_arch}/${_target_mode}`;
    }
    return targetdir;
};

const _get_target_objectdir = (name) => {
    let objectdir = "";
    if (_has_target_item(name, "objectdir")) {
        objectdir = _get_target_item(name, "objectdir");
    } else {
        objectdir = `${xmake_sh_buildir}/.objs/${name}/${_target_plat}/${_target_arch}/${_target_mode}`;
    }
    return objectdir;
};

// 获取目标文件路径
function _get_target_file(name) {
    const filename = _get_target_filename(name);
    const targetdir = _get_targetdir(name);
    const targetfile = `${targetdir}/${filename}`;
    return targetfile;
}

// 获取目标中的源文件
function _get_target_sourcefiles(name) {
    const sourcefiles = _get_target_item(name, "files");
    return sourcefiles;
}

// 获取目标中的目标文件
function _get_target_objectfile(name, sourcefile) {
    const filename = path_filename(sourcefile);
    let extension = ".o";
    if (is_plat("mingw")) {
        extension = ".obj";
    }
    filename = path_extensionstring_replace(filename, extension);
    const objectdir = _get_target_objectdir(name);
    const objectfile = `${objectdir}/${filename}`;
    return objectfile;
}

const _get_target_objectfiles = (name) => {
    const sourcefiles = _get_target_sourcefiles(name);
    let objectfiles = '';
    sourcefiles.forEach((sourcefile) => {
        const objectfile = _get_target_objectfile(name, sourcefile);
        objectfiles += `${objectfile}`;
    });
    return objectfiles;
};

const _get_target_values = (name, itemname) => {
    let values = _get_target_item(name, itemname);
    const options = _get_target_item(name, 'options');
    options.forEach((option) => {
        if (has_config(option)) {
            const option_values = _get_option_item(option, itemname);
            if (_test_nz(option_values)) {
                values += `${option_values}`;
            }
        }
    });
    return values;
};

// 获取目标抽象标志
function _get_target_abstract_flags(name, toolkind, toolname, itemname, values) {
    if (_test_z(values)) {
        values = _get_target_values(name, itemname);
    }
    const flags = _get_abstract_flags(toolkind, toolname, itemname, values);
    return flags;
}

// 获取目标工具链ar标志
function _get_target_toolchain_flags_for_ar() {
    return "-cr";
}

// 获取目标工具链gcc/clang标志
function _get_target_toolchain_flags_for_gcc_clang(name, toolkind) {
    let flags = "";
    const targetkind = _get_target_item(name, "kind");
    if (_test_eq(targetkind, "shared") && _test_eq(toolkind, "sh")) {
        flags = "-shared -fPIC";
    }
    return flags;
}

const _get_target_toolchain_flags = (name, toolkind, toolname) => {
    let flags = "";
    switch (toolname) {
        case "gcc":
            flags = _get_target_toolchain_flags_for_gcc_clang(name, toolkind);
            break;
        case "gxx":
            flags = _get_target_toolchain_flags_for_gcc_clang(name, toolkind);
            break;
        case "clang":
            flags = _get_target_toolchain_flags_for_gcc_clang(name, toolkind);
            break;
        case "clangxx":
            flags = _get_target_toolchain_flags_for_gcc_clang(name, toolkind);
            break;
        case "ar":
            flags = _get_target_toolchain_flags_for_ar(name, toolkind);
            break;
        default:
            throw new Error("unknown toolname(" + toolname + ")!");
            break;
    }
    return flags;
};

const _get_target_compiler_flags = (name, toolkind) => {
    const program = _get_toolchain_toolset(_target_toolchain, toolkind);
    const toolname = path_toolname(program);
    let result = "";
    // get toolchain flags
    const toolchain_flags = _get_target_toolchain_flags(name, toolkind, toolname);
    if (_test_nz(toolchain_flags)) {
        result = `${result} ${toolchain_flags}`;
    }

    // get abstract flags
    const itemnames = "symbols optimizes warnings languages defines undefines includedirs frameworkdirs frameworks";
    for (const itemname of itemnames.split(" ")) {
        const flags = _get_target_abstract_flags(name, toolkind, toolname, itemname);
        if (_test_nz(flags)) {
            result = `${result} ${flags}`;
        }
    }

    // get raw flags, e.g. add_cflags, add_cxxflags
    const flagname = _get_flagname(toolkind);
    let flags = _get_target_values(name, flagname);
    if (_test_nz(flags)) {
        result = `${result} ${flags}`;
    }
    if (_test_eq(flagname, "cflags") || _test_eq(flagname, "cxxflags")) {
        flags = _get_target_values(name, "cxflags");
        if (_test_nz(flags)) {
            result = `${result} ${flags}`;
        }
    } else if (_test_eq(flagname, "mflags") || _test_eq(flagname, "mxxflags")) {
        flags = _get_target_values(name, "mxflags");
        if (_test_nz(flags)) {
            result = `${result} ${flags}`;
        }
    }

    return result;

}

function _get_target_linker_flags(name, toolkind) {
    const program = _get_toolchain_toolset(_target_toolchain, toolkind);
    const toolname = path_toolname(program);
    let result = "";

    // get toolchain flags
    const toolchain_flags = _get_target_toolchain_flags(name, toolkind, toolname);
    if (_test_nz(toolchain_flags)) {
        result = `${result} ${toolchain_flags}`;
    }

    // get flags from target deps
    const deps = _get_target_item(name, "deps");
    deps.split(' ').forEach(dep => {
        const dep_kind = _get_target_item(dep, "kind");
        if (_test_eq(dep_kind, "static") || _test_eq(dep_kind, "shared")) {
            const dep_targetdir = _get_targetdir(dep);
            const dep_basename = _get_target_basename(dep);
            const linkdirs_flags = _get_target_abstract_flags(dep, toolkind, toolname, "linkdirs", dep_targetdir);
            const links_flags = _get_target_abstract_flags(dep, toolkind, toolname, "links", dep_basename);
            if (_test_eq(dep_kind, "shared")) {
                let rpathdir = "@loader_path";
                const targetdir = _get_targetdir(name);
                const subdir = path_relative(targetdir, dep_targetdir);
                if (_test_nz(subdir)) {
                    rpathdir = `${rpathdir}/${subdir}`;
                }
                const rpathdirs_flags = _get_target_abstract_flags(dep, toolkind, toolname, "rpathdirs", rpathdir);
                result = `${result} ${rpathdirs_flags}`;
            }
            result = `${result} ${linkdirs_flags} ${links_flags}`;
        }
    });

    // get abstract flags
    const itemnames = "strip frameworkdirs linkdirs links rpathdirs frameworks syslinks";
    itemnames.split(' ').forEach(itemname => {
        const flags = _get_target_abstract_flags(name, toolkind, toolname, itemname);
        if (_test_nz(flags)) {
            result = `${result} ${flags}`;
        }
    });

    // get raw flags, e.g. add_ldflags, add_shflags
    const flagname = _get_flagname(toolkind);
    const flags = _get_target_values(name, flagname);
    if (_test_nz(flags)) {
        result = `${result} ${flags}`;
    }

    return result;
}

// 获取目标的归档器标志
function _get_target_archiver_flags(name, toolkind) {
    const program = _get_toolchain_toolset(_target_toolchain, toolkind);
    const toolname = path_toolname(program);
    let result = "";
    // 获取工具链标志
    const toolchain_flags = _get_target_toolchain_flags(name, toolkind, toolname);
    if (_test_nz(toolchain_flags)) {
        result = `${result} ${toolchain_flags}`;
    }

    // 获取原始标志，如add_arflags
    const flagname = _get_flagname(toolkind);
    const flags = _get_target_item(name, flagname);
    if (_test_nz(flags)) {
        result = `${result} ${flags}`;
    }

    return result;
}

// 获取目标标志
function _get_target_flags(name, toolkind) {
    let flags = "";
    if (`x${toolkind}` === "xsh") {
        flags = _get_target_linker_flags(name, toolkind);
    } else if (`x${toolkind}` === "xld") {
        flags = _get_target_linker_flags(name, toolkind);
    } else if (`x${toolkind}` === "xar") {
        flags = _get_target_archiver_flags(name, toolkind);
    } else {
        flags = _get_target_compiler_flags(name, toolkind);
    }
    return flags;
}

// 添加文件路径到目标
const _add_target_filepaths = (key, ...files) => {
    // we need avoid escape * automatically in for-loop
    const list = files.map(file => file.replace(/\*/g, "?"));
    for (const file of list) {
        file = file.replace(/?/g, "");
        if (!path_is_absolute(file)) {
            file = `${xmake_sh_scriptdir}/${file}`;
        }
        let files = "";
        if (string_contains(file, "**")) {
            const dir = path_directory(file);
            const name = path_filename(file);
            files = _os_find(dir, name);
        } else if (string_contains(file, "")) {
            const dir = path_directory(file);
            const name = path_filename(file);
            files = _os_find(dir, name, 1);
        } else {
            files = file;
        }
        for (const file of files) {
            file = path_relative(xmake_sh_projectdir, file);
            _add_target_item(_xmake_sh_target_current, key, file);
        }
    }
};

const _add_target_installpaths = (key, filepattern, prefixdir) => {
    // get root directory, e.g. "src/foo/(*.h)" -> "src/foo"
    let rootdir = "";
    if (string_contains(filepattern, "(")) {
        rootdir = string_split(filepattern, "(", 1);
        rootdir = rootdir.slice(0, -1);
        if (!path_is_absolute(`${rootdir}`)) {
            rootdir = `${xmake_sh_scriptdir}/${rootdir}`;
        }
        rootdir = path_relative(xmake_sh_projectdir, rootdir);
        rootdir = rootdir.slice(0, -1);
    }

    // remove (), e.g. "src/(.h)" -> "src/.h"
    filepattern = string_replace(filepattern, "(", "");
    filepattern = string_replace(filepattern, ")", "");

    // get real path
    if (!path_is_absolute(filepattern)) {
        filepattern = `${xmake_sh_scriptdir}/${filepattern}`;
    }
    let files = "";
    if (string_contains(filepattern, "**")) {
        const dir = path_directory(filepattern);
        const name = path_filename(filepattern);
        files = _os_find(dir, name);
    } else if (string_contains(filepattern, "*")) {
        const dir = path_directory(filepattern);
        const name = path_filename(filepattern);
        files = _os_find(dir, name, 1);
    } else {
        files = filepattern;
    }
    for (const file of files.split(" ")) {
        file = path_relative(xmake_sh_projectdir, file);
        _add_target_item(_xmake_sh_target_current, key, `${file}:${rootdir}:${prefixdir}`);
    }
};

// set target file path
function _set_target_filepath(key, path) {
    if (!path_is_absolute(path)) {
        path = `${xmake_sh_scriptdir}/${path}`;
    }
    path = path_relative(xmake_sh_projectdir, path);
    _set_target_item(_xmake_sh_target_current, key, path);
}

// set kind in target
function set_kind(kind) {
    if (!_loading_targets) {
        return;
    }
    _set_target_item(_xmake_sh_target_current, "kind", kind);
}

// set version in target
function set_version(version, version_build) {
    if (!_loading_targets) {
        return;
    }
    _set_target_item(_xmake_sh_target_current, "version", version);
    _set_target_item(_xmake_sh_target_current, "version_build", version_build);
}

// set default in target
function set_default(_default) {
    if (_loading_targets && _test_z(_xmake_sh_option_current)) {
        _set_target_item(_xmake_sh_target_current, "default", _default);
    } else if (_loading_options && _test_nz(_xmake_sh_option_current)) {
        _set_option_item(_xmake_sh_option_current, "default", _default);
    }
}

// set configvar in target
function set_configvar(name, value) {
    if (_loading_targets && _test_z(_xmake_sh_option_current)) {
        _set_target_item(xmake_sh_target_current, "configvar" + name, value);
        _add_target_item(_xmake_sh_target_current, "configvars", name);
    } else if (_loading_options && _test_nz(_xmake_sh_option_current)) {
        _set_option_item(xmake_sh_option_current, "configvar" + name, value);
        _add_option_item(_xmake_sh_option_current, "configvars", name);
    }
}

// set filename in target
function set_filename(filename) {
    if (!_loading_targets) {
        return;
    }
    _set_target_item(_xmake_sh_target_current, "filename", filename);
}

// set basename in target
function set_basename(basename) {
    if (!_loading_targets) {
        return;
    }
    _set_target_item(_xmake_sh_target_current, "basename", basename);
}

// set extension in target
function set_extension(extension) {
    if (!_loading_targets) {
        return;
    }
    _set_target_item(_xmake_sh_target_current, "extension", extension);
}

// set prefixname in target
function set_prefixname(prefixname) {
    if (!_loading_targets) {
        return;
    }
    _set_target_item(_xmake_sh_target_current, "prefixname", prefixname);
}

// set target directory
function set_targetdir(dir) {
    if (!_loading_targets) {
        return;
    }
    _set_target_filepath("targetdir", dir);
}

// set target object directory
function set_objectdir(dir) {
    if (!_loading_targets) {
        return;
    }
    _set_target_filepath("objectdir", dir);
}

// set target config directory
function set_configdir(dir) {
    if (!_loading_targets) {
        return;
    }
    _set_target_filepath("configdir", dir);
}

// set target install directory
function set_installdir(dir) {
    if (!_loading_targets) {
        return;
    }
    _set_target_filepath("installdir", dir);
}

// add deps in target
const add_deps = function () {
    if (!_loading_targets) {
        return;
    }
    for (let dep of arguments) {
        _add_target_item(_xmake_sh_target_current, "deps", dep);
    }
};

// add options in target
const add_options = function () {
    if (!_loading_targets) {
        return;
    }
    for (let option of arguments) {
        _add_target_item(_xmake_sh_target_current, "options", option);
    }
};

// add files in target
const add_files = function () {
    if (!_loading_targets) {
        return;
    }
    _add_target_filepaths("files", ...arguments);
};

// add install files in target
const add_installfiles = function () {
    if (!_loading_targets) {
        return;
    }
    _add_target_installpaths("installfiles", ...arguments);
};

// add header files in target
const add_headerfiles = function () {
    if (!_loading_targets) {
        return;
    }
    _add_target_installpaths("headerfiles", ...arguments);
};

// add config files in target
const add_configfiles = function () {
    if (!_loading_targets) {
        return;
    }
    _add_target_filepaths("configfiles", ...arguments);
};

// add defines in target
const add_defines = function () {
    if (_loading_targets && _test_z(_xmake_sh_option_current)) {
        for (let define of arguments) {
            _add_target_item(_xmake_sh_target_current, "defines", define);
        }
    } else if (_loading_options && _test_nz(_xmake_sh_option_current)) {
        for (let define of arguments) {
            _add_option_item(_xmake_sh_option_current, "defines", define);
        }
    }
};

// add udefines in target
const add_udefines = function () {
    if (_loading_targets && _test_z(_xmake_sh_option_current)) {
        for (let udefine of arguments) {
            _add_target_item(_xmake_sh_target_current, "udefines", udefine);
        }
    } else if (_loading_options && _test_nz(_xmake_sh_option_current)) {
        for (let udefine of arguments) {
            _add_option_item(_xmake_sh_option_current, "udefines", udefine);
        }
    }
};

// add includedirs in target
function add_includedirs() {
    for (const dir of arguments) {
        if (!path_is_absolute(dir)) {
            dir = `${xmake_sh_scriptdir}/${dir}`;
        }
        dir = path_relative(xmake_sh_projectdir, dir);
        if (_loading_targets && _test_z(_xmake_sh_option_current)) {
            _add_target_item(_xmake_sh_target_current, "includedirs", dir);
        } else if (_loading_options && _test_nz(_xmake_sh_option_current)) {
            _add_option_item(_xmake_sh_option_current, "includedirs", dir);
        }
    }
}

// add links in target
function add_links() {
    if (_loading_targets && _test_z(_xmake_sh_option_current)) {
        for (const link of arguments) {
            _add_target_item(_xmake_sh_target_current, "links", link);
        }
    } else if (_loading_options && _test_nz(_xmake_sh_option_current)) {
        for (const link of arguments) {
            _add_option_item(_xmake_sh_option_current, "links", link);
        }
    }
}

// add syslinks in target
function add_syslinks() {
    if (_loading_targets && _test_z(_xmake_sh_option_current)) {
        for (const syslink of arguments) {
            _add_target_item(_xmake_sh_target_current, "syslinks", syslink);
        }
    } else if (_loading_options && _test_nz(_xmake_sh_option_current)) {
        for (const syslink of arguments) {
            _add_option_item(_xmake_sh_option_current, "syslinks", syslink);
        }
    }
}

// add linkdirs in target
function add_linkdirs() {
    for (const dir of arguments) {
        if (!path_is_absolute(dir)) {
            dir = `${xmake_sh_scriptdir}/${dir}`;
        }
        dir = path_relative(xmake_sh_projectdir, dir);
        if (_loading_targets && _test_z(_xmake_sh_option_current)) {
            _add_target_item(_xmake_sh_target_current, "linkdirs", dir);
        } else if (_loading_options && _test_nz(_xmake_sh_option_current)) {
            _add_option_item(_xmake_sh_option_current, "linkdirs", dir);
        }
    }
}


// add rpathdirs in target
function add_rpathdirs(...dirs) {
    if (!_loading_targets) {
        return;
    }
    for (const dir of dirs) {
        if (!path_is_absolute(dir)) {
            dir = `${xmake_sh_scriptdir}/${dir}`;
        }
        dir = path_relative(xmake_sh_projectdir, dir);
        _add_target_item(_xmake_sh_target_current, "rpathdirs", dir);
    }
}

// add frameworks in target
function add_frameworks(...frameworks) {
    if (_loading_targets && _test_z(_xmake_sh_option_current)) {
        for (const framework of frameworks) {
            _add_target_item(_xmake_sh_target_current, "frameworks", framework);
        }
    } else if (_loading_options && _test_nz(_xmake_sh_option_current)) {
        for (const framework of frameworks) {
            _add_option_item(_xmake_sh_option_current, "frameworks", framework);
        }
    }
}

// add frameworkdirs in target
function add_frameworkdirs(...dirs) {
    for (const dir of dirs) {
        if (!path_is_absolute(dir)) {
            dir = `${xmake_sh_scriptdir}/${dir}`;
        }
        dir = path_relative(xmake_sh_projectdir, dir);
        if (_loading_targets && _test_z(_xmake_sh_option_current)) {
            _add_target_item(_xmake_sh_target_current, "frameworkdirs", dir);
        } else if (_loading_options && _test_nz(_xmake_sh_option_current)) {
            _add_option_item(_xmake_sh_option_current, "frameworkdirs", dir);
        }
    }
}

// set strip in target
function set_strip(strip) {
    if (!_loading_targets) {
        return;
    }
    _set_target_item(_xmake_sh_target_current, "strip", strip);
}

// set symbols in target
function set_symbols(symbols) {
    if (!_loading_targets) {
        return;
    }
    _set_target_item(_xmake_sh_target_current, "symbols", symbols);
}

// set languages in target
function set_languages(languages) {
    if (_loading_targets && _test_z(_xmake_sh_option_current)) {
        _set_target_item(_xmake_sh_target_current, "languages", languages);
    } else if (_loading_options && _test_nz(_xmake_sh_option_current)) {
        _set_option_item(_xmake_sh_option_current, "languages", languages);
    }
}

// set warnings in target
function set_warnings(warnings) {
    if (_loading_targets && _test_z(_xmake_sh_option_current)) {
        _set_target_item(_xmake_sh_target_current, "warnings", warnings);
    } else if (_loading_options && _test_nz(_xmake_sh_option_current)) {
        _set_option_item(_xmake_sh_option_current, "warnings", warnings);
    }
}

// set optimizes in target
function set_optimizes(optimizes) {
    if (_loading_targets && _test_z(_xmake_sh_option_current)) {
        _set_target_item(_xmake_sh_target_current, "optimizes", optimizes);
    } else if (_loading_options && _test_nz(_xmake_sh_option_current)) {
        _set_option_item(_xmake_sh_option_current, "optimizes", optimizes);
    }
}

// add cflags in target
function add_cflags(...flags) {
    if (_loading_targets && _test_z(_xmake_sh_option_current)) {
        for (const flag of arguments) {
            _add_target_item(_xmake_sh_target_current, "cflags", flag);
        }
    } else if (_loading_options && _test_nz(_xmake_sh_option_current)) {
        for (const flag of arguments) {
            _add_option_item(_xmake_sh_option_current, "cflags", flag);
        }
    }
}

// add cxflags in target
function add_cxflags(...flags) {
    if (_loading_targets && _test_z(_xmake_sh_option_current)) {
        for (const flag of arguments) {
            _add_target_item(_xmake_sh_target_current, "cxflags", flag);
        }
    } else if (_loading_options && _test_nz(_xmake_sh_option_current)) {
        for (const flag of arguments) {
            _add_option_item(_xmake_sh_option_current, "cxflags", flag);
        }
    }
}

const add_cxxflags = (...flags) => {
    if (_loading_targets && _test_z(_xmake_sh_option_current)) {
        flags.forEach((flag) => {
            _add_target_item(_xmake_sh_target_current, 'cxxflags', flag);
        });
    } else if (_loading_options && _test_nz(_xmake_sh_option_current)) {
        flags.forEach((flag) => {
            _add_option_item(_xmake_sh_option_current, 'cxxflags', flag);
        });
    }
}

const add_asflags = (...flags) => {
    if (!_loading_targets) {
        return;
    }
    flags.forEach((flag) => {
        _add_target_item(_xmake_sh_target_current, 'asflags', flag);
    });
}

const add_mflags = (...flags) => {
    if (!_loading_targets) {
        return;
    }
    flags.forEach((flag) => {
        _add_target_item(_xmake_sh_target_current, 'mflags', flag);
    });
}

const add_mxflags = (...flags) => {
    if (!_loading_targets) {
        return;
    }
    flags.forEach((flag) => {
        _add_target_item(_xmake_sh_target_current, 'mxflags', flag);
    });
}

const add_mxxflags = (...flags) => {
    if (!_loading_targets) {
        return;
    }
    flags.forEach((flag) => {
        _add_target_item(_xmake_sh_target_current, 'mxxflags', flag);
    });
}

const add_ldflags = (...flags) => {
    if (!_loading_targets) {
        return;
    }
    flags.forEach((flag) => {
        _add_target_item(_xmake_sh_target_current, 'ldflags', flag);
    });
}

const add_shflags = (...flags) => {
    if (!_loading_targets) {
        return;
    }
    flags.forEach((flag) => {
        _add_target_item(_xmake_sh_target_current, 'shflags', flag);
    });
}

const add_arflags = (...flags) => {
    if (!_loading_targets) {
        return;
    }
    flags.forEach((flag) => {
        _add_target_item(_xmake_sh_target_current, 'arflags', flag);
    });
}

// 工具链配置API

// 定义工具链
function toolchain(name) {
    _xmake_sh_toolchain_current = name;
    if (!_loading_toolchains) {
        return;
    }
    _xmake_sh_toolchains = `${_xmake_sh_toolchains} ${name}`;
    _map_set('toolchains', `${name}_name`, name);
    return 0;
}
function toolchain_end() {
    _xmake_sh_toolchain_current = '';
}
_map('toolchains');

// 是否有指定的工具链
function _has_toolchain(name) {
    if (_map_has('toolchains', `${name}_name`)) {
        return 0;
    }
    return 1;
}

// 获取指定的工具链项目
function _get_toolchain_item(name, key) {
    const value = _map_get('toolchains', `${name}_${key}`);
    return value;
}

// 设置指定的工具链项目
function _set_toolchain_item(name, key, value) {
    if (_test_nz(name)) {
        _map_set('toolchains', `${name}_${key}`, value);
    } else {
        raise('please set toolchain in the toolchain scope!');
    }
}

// 获取指定的工具链工具集
function _get_toolchain_toolset(name, kind) {
    const programs = _get_toolchain_item(name, `toolset_${kind}`);
    return programs;
}

// 设置指定的工具链工具集
function _set_toolchain_toolset(name, kind, programs) {
    _set_toolchain_item(name, `toolset_${kind}`, programs);
}

const set_toolset = (kind, programs) => {
    if (!_loading_toolchains) {
        return;
    }
    _set_toolchain_toolset(_xmake_sh_toolchain_current, kind, programs);
};

// clang toolchain
toolchain("clang");
set_toolset("as", "clang");
set_toolset("cc", "clang");
set_toolset("cxx", "clang clang++");
set_toolset("mm", "clang");
set_toolset("mxx", "clang clang++");
set_toolset("ld", "clang++ clang");
set_toolset("sh", "clang++ clang");
set_toolset("ar", "ar");
toolchain_end();

// gcc toolchain
toolchain("gcc");
set_toolset("as", "gcc");
set_toolset("cc", "gcc");
set_toolset("cxx", "gcc g++");
set_toolset("mm", "gcc");
set_toolset("mxx", "gcc g++");
set_toolset("ld", "g++ gcc");
set_toolset("sh", "g++ gcc");
set_toolset("ar", "ar");
toolchain_end();


// 加载选项
//

// 加载选项和工具链
function _load_options_and_toolchains() {
    _loading_options = true;
    _loading_toolchains = true;
    _loading_targets = false;
    let file = xmake_sh_projectdir + '/xmake.sh';
    if (fs.existsSync(file)) {
        includes(file);
    } else {
        // 包含下一个子目录中的所有xmake.sh文件
        let files = glob.sync(`${xmake_sh_projectdir}/**/xmake.sh`, {
            maxDepth: 2,
            minDepth: 2,
        });
        for (const file of files) {
            includes(file);
        }
    }
}
_load_options_and_toolchains();

// 显示选项用法
function _show_options_usage() {
    let options = _get_options_for_menu();
    for (const name of options) {
        let description = _get_option_item(name, 'description');
        let _default = _get_option_item(name, 'default');
        let head = '--' + name + '=' + name.toUpperCase();
        let headsize = head.length;
        let tail = description;
        if (_default !== undefined) {
            let defval = _default;
            if (defval === 'true') {
                defval = 'yes';
            } else if (defval === 'false') {
                defval = 'no';
            }
            tail = `${tail} (default: ${defval})`;
        }
        let width = 24;
        let padding_width = width - headsize;
        let padding = ' '.repeat(padding_width);
        console.log(`${head}${padding}${tail}`);
    }
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
  
    --generator=GENERATOR   Set the project generator. (default: ${_project_generator
        })
                              - gmake
                              - ninja
    --make=MAKE             Set the make program. (default: ${_make_program_default
        })
    --ninja=NINJA           Set the Ninja program. (default: ${_ninja_program_default
        })
    --plat=PLAT             Compile for the given platform. (default: ${_target_plat_default
        })
                              - msys
                              - cross
                              - bsd
                              - mingw
                              - macosx
                              - linux
    --arch=ARCH             Compile for the given architecture. (default: ${_target_arch_default
        })
                              - msys: i386 x86_64
                              - cross: i386 x86_64 arm arm64 mips mips64 riscv riscv64 s390x ppc ppc64 sh4
                              - bsd: i386 x86_64
                              - mingw: i386 x86_64 arm arm64
                              - macosx: x86_64 arm64
                              - linux: i386 x86_64 armv7 armv7s arm64-v8a mips mips64 mipsel mips64el
    --mode=MODE             Set the given compilation mode. (default: ${_target_mode_default
        })
                              - release
                              - debug
    --toolchain=TOOLCHAIN   Set toolchain name.
                              - clang
                              - gcc
  
    --prefix=PREFIX         Set install files directory in tree rooted at PREFIX. (default: ${_install_prefix_default
        })
    --bindir=DIR            Set install binaries directory in PREFIX/DIR. (default: ${_install_bindir_default
        })
    --libdir=DIR            Set install libraries directory in PREFIX/DIR. (default: ${_install_libdir_default
        })
    --includedir=DIR        Set install includes directory in PREFIX/DIR. (default: ${_install_includedir_default
        })
    --buildir=DIR           Set build directory. (default: ${xmake_sh_buildir})
  
  Project options:
  ${_show_options_usage()}
  `);
    process.exit(1);
}


let _target_plat;
let _target_arch;
let _target_mode;
let _target_toolchain;
let _make_program;
let _ninja_program;

// show xmake.sh version
function _show_version() {
    console.log(`xmake.sh v${xmake_sh_version}, A script-only build utility like autotools`);
    console.log(xmake_sh_copyright);
    console.log('                         _               _            ');
    console.log("    __  ___ __  __  __ _| | ______   ___| |__         ");
    console.log("    \ \/ / |  \/  |/ _  | |/ / __ \ / __| '_  \       ");
    console.log("     >  <  | \__/ | /_| |   <  ___/_\__ \ | | |       ");
    console.log("    /_/\_\_|_|  |_|\__ \|_|\_\____(_)___/_| |_|       ");
    console.log('                                     by ruki, xmake.io');
    console.log('                                                      ');
    console.log('   👉  Manual: https://xmake.io/#/getting_started     ');
    console.log('   🙏  Donate: https://xmake.io/#/sponsor             ');
    console.log('                                                      ');
    process.exit(2);
}


// --foo=yes => foo
function _parse_argument_name(arg, separator) {
    return arg.replace(/^--/, '').replace(new RegExp(`${separator || '=[^=]*'}$`), '');
}

// --foo=yes => yes
function _parse_argument_value(arg, separator) {
    return arg.replace(new RegExp(`^${separator || '[^=]*='}`), '');
}


const _handle_option = (arg) => {
    const name = _parse_argument_name(arg);
    const value = _parse_argument_value(arg);
    if (_test_eq(name, "help")) {
        _show_usage();
        return 0;
    } else if (_test_eq(name, "version")) {
        _show_version();
        return 0;
    } else if (_test_eq(name, "verbose")) {
        xmake_sh_verbose = true;
        return 0;
    } else if (_test_eq(name, "diagnosis")) {
        xmake_sh_diagnosis = true;
        return 0;
    } else if (_test_eq(name, "plat")) {
        _target_plat = value;
        return 0;
    } else if (_test_eq(name, "arch")) {
        _target_arch = value;
        return 0;
    } else if (_test_eq(name, "mode")) {
        _target_mode = value;
        return 0;
    } else if (_test_eq(name, "toolchain")) {
        _target_toolchain = value;
        return 0;
    } else if (_test_eq(name, "generator")) {
        _project_generator = value;
        return 0;
    } else if (_test_eq(name, "make")) {
        _make_program = value;
        return 0;
    } else if (_test_eq(name, "ninja")) {
        _ninja_program = value;
        return 0;
    } else if (_test_eq(name, "prefix")) {
        _install_prefix_default = value;
        return 0;
    } else if (_test_eq(name, "bindir")) {
        _install_bindir_default = value;
        return 0;
    } else if (_test_eq(name, "libdir")) {
        _install_libdir_default = value;
        return 0;
    } else if (_test_eq(name, "includedir")) {
        _install_includedir_default = value;
        return 0;
    } else if (_test_eq(name, "buildir")) {
        xmake_sh_buildir = value;
        return 0;
    } else if (_has_option(name)) {
        _set_option_value(name, value);
        return 0;
    }
    return 1;
}
const args = process.argv.slice(2); // 获取命令行参数，去除node和脚本名称

while (args.length !== 0) {
    const option = args.shift();
    if (!_handle_option(option)) {
        throw new Error(`Unknown option: ${option}`);
    }
}

const _check_platform = () => {
    if (`x${_target_plat}` === "x") {
        _target_plat = _target_plat_default;
    }
    if (`x${_target_arch}` === "x") {
        _target_arch = _target_arch_default;
    }
    if (`x${_target_mode}` === "x") {
        _target_mode = _target_mode_default;
    }
    console.log(`checking for platform ... ${_target_plat}`);
    console.log(`checking for architecture ... ${_target_arch}`);
}

const _toolchain_compcmd_for_gcc_clang = (program, objectfile, sourcefile, flags) => {
    return `${program} -c ${flags} -o ${objectfile} ${sourcefile}`;
}

const _toolchain_linkcmd_for_gcc_clang = (toolkind, program, binaryfile, objectfiles, flags) => {
    if (_test_eq(toolkind, "sh")) {
        flags = "-shared -fPIC ${flags}";
    }
    return `${program} -o ${binaryfile} ${objectfiles} ${flags}`;
}

const _toolchain_linkcmd_for_ar = (toolkind, program, binaryfile, objectfiles, flags) => {
    return `${program} ${flags} ${binaryfile} ${objectfiles}`;
}

const _toolchain_compcmd = (sourcekind, objectfile, sourcefile, flags) => {
    const program = _get_toolchain_toolset(_target_toolchain, sourcekind);
    const toolname = path_toolname(program);
    let compcmd = "";
    switch (toolname) {
        case "gcc":
            compcmd = _toolchain_compcmd_for_gcc_clang(program, objectfile, sourcefile, flags);
            break;
        case "gxx":
            compcmd = _toolchain_compcmd_for_gcc_clang(program, objectfile, sourcefile, flags);
            break;
        case "clang":
            compcmd = _toolchain_compcmd_for_gcc_clang(program, objectfile, sourcefile, flags);
            break;
        case "clangxx":
            compcmd = _toolchain_compcmd_for_gcc_clang(program, objectfile, sourcefile, flags);
            break;
        default:
            throw new Error(`unknown toolname(${toolname})!`);
    }
    return compcmd;
}

const _toolchain_linkcmd = (toolkind, binaryfile, objectfiles, flags) => {
    const program = _get_toolchain_toolset(_target_toolchain, toolkind);
    const toolname = path_toolname(program);
    let linkcmd = "";
    switch (toolname) {
        case "gcc":
            linkcmd = _toolchain_linkcmd_for_gcc_clang(toolkind, program, binaryfile, objectfiles, flags);
            break;
        case "gxx":
            linkcmd = _toolchain_linkcmd_for_gcc_clang(toolkind, program, binaryfile, objectfiles, flags);
            break;
        case "clang":
            linkcmd = _toolchain_linkcmd_for_gcc_clang(toolkind, program, binaryfile, objectfiles, flags);
            break;
        case "clangxx":
            linkcmd = _toolchain_linkcmd_for_gcc_clang(toolkind, program, binaryfile, objectfiles, flags);
            break;
        case "ar":
            linkcmd = _toolchain_linkcmd_for_ar(toolkind, program, binaryfile, objectfiles, flags);
            break;
        default:
            raise("unknown toolname(${toolname})!");
            break;
    }
    return linkcmd;
};

const _toolchain_try_make = (program) => {
    if (_os_runv(program, "--version")) {
        return 0;
    }
    return 1;
};

const _toolchain_try_ninja = (program) => {
    if (_os_runv(program, "--version")) {
        return 0;
    }
    return 1;
};

let _toolchain_try_gcc_result = "";
const _toolchain_try_gcc = (kind, program) => {
    if (_toolchain_try_gcc_result === "ok") {
        return 0;
    } else if (_toolchain_try_gcc_result === "no") {
        return 1;
    }
    if (_os_runv(program, "--version")) {
        _toolchain_try_gcc_result = "ok";
        return 0;
    }
    _toolchain_try_gcc_result = "no";
    return 1;
};

// try g++
function _toolchain_try_gxx(kind, program) {
    if (_toolchain_try_gxx_result === "ok") {
        return 0;
    } else if (_toolchain_try_gxx_result === "no") {
        return 1;
    }
    if (_os_runv(`${program} --version`)) {
        _toolchain_try_gxx_result = "ok";
        return 0;
    }
    _toolchain_try_gxx_result = "no";
    return 1;

}

// try clang
function _toolchain_try_clang(kind, program) {
    if (_toolchain_try_clang_result === "ok") {
        return 0;
    } else if (_toolchain_try_clang_result === "no") {
        return 1;
    }

    if (_os_runv(`${program} --version`)) {
        _toolchain_try_clang_result = "ok";
        return 0;
    }
    _toolchain_try_clang_result = "no";
    return 1;

}

// try clang++
function _toolchain_try_clangxx(kind, program) {
    if (_toolchain_try_clangxx_result === "ok") {
        return 0;
    } else if (_toolchain_try_clangxx_result === "no") {
        return 1;
    }
    if (_os_runv(`${program} --version`)) {
        _toolchain_try_clangxx_result = "ok";
        return 0;
    }
    _toolchain_try_clangxx_result = "no";
    return 1;

}

const _toolchain_try_ar = (kind, program) => {
    // generate the source file
    let tmpfile = _os_tmpfile();
    let objectfile = `${tmpfile}.o`;
    let libraryfile = `${tmpfile}.a`;
    echo("", objectfile);

    // try linking it
    let ok = false;
    if (_os_runv(program, "-cr", libraryfile, objectfile)) {
        ok = true;
    }

    // remove files
    _os_tryrm(objectfile);
    _os_tryrm(libraryfile);
    if (ok) {
        return 0;
    }
    return 1;
}

const _toolchain_try_program = (toolchain, kind, program) => {
    let ok = false;
    let toolname = path_toolname(program);
    switch (toolname) {
        case "gcc":
            _toolchain_try_gcc(kind, program) && (ok = true);
            break;
        case "gxx":
            _toolchain_try_gxx(kind, program) && (ok = true);
            break;
        case "clang":
            _toolchain_try_clang(kind, program) && (ok = true);
            break;
        case "clangxx":
            _toolchain_try_clangxx(kind, program) && (ok = true);
            break;
        case "ar":
            _toolchain_try_ar(kind, program) && (ok = true);
            break;
        default:
            raise("unknown toolname(" + toolname + ")!");
            break;
    }
    if (ok) {
        vprint(`checking for ${program} ... ok`);
        return 0;
    }
    vprint(`checking for ${program} ... no`);
    return 1;
}

const _toolchain_try_toolset = (toolchain, kind, description) => {
    let programs = _get_toolchain_toolset(toolchain, kind);
    for (let program of programs) {
        if (_toolchain_try_program(toolchain, kind, program)) {
            _set_toolchain_toolset(toolchain, kind, program);
            console.log(`checking for the ${description} (${kind}) ... ${program}`);
            return 0;
        }
    }
    return 1;
}

// try toolchain
function _toolchain_try(toolchain) {
    vprint(`checking for ${toolchain} toolchain ...`);
    if (_toolchain_try_toolset(toolchain, 'cc', 'c compiler') &&
        _toolchain_try_toolset(toolchain, 'cxx', 'c++ compiler') &&
        _toolchain_try_toolset(toolchain, 'as', 'assembler') &&
        _toolchain_try_toolset(toolchain, 'mm', 'objc compiler') &&
        _toolchain_try_toolset(toolchain, 'mxx', 'objc++ compiler') &&
        _toolchain_try_toolset(toolchain, 'ld', 'linker') &&
        _toolchain_try_toolset(toolchain, 'ar', 'static library archiver') &&
        _toolchain_try_toolset(toolchain, 'sh', 'shared library linker')) {
        return 0;
    }
    return 1;
}

// detect make
function _toolchain_detect_make() {
    if (test === 'x${_make_program}') {
        _make_program = _make_program_default;
    }
    if (_toolchain_try_make(_make_program)) {
        console.log('checking for make ... ok');
    } else {
        console.log('checking for make ... no');
        raise('make not found!');
    }
}

// detect ninja
function _toolchain_detect_ninja() {
    if (test === 'x${_ninja_program}') {
        _ninja_program = _ninja_program_default;
    }
    if (_toolchain_try_ninja(_ninja_program)) {
        console.log('checking for ninja ... ok');
    } else {
        console.log('checking for ninja ... no');
        raise('ninja not found!');
    }
}

// detect build backend
function _toolchain_detect_backend() {
    if (test === 'x${_project_generator}') {
        _toolchain_detect_make();
    } else if (test === 'x${_project_generator}') {
        _toolchain_detect_ninja();
    }
}

// detect toolchain
function _toolchain_detect(toolchains) {
    // detect build backend
    _toolchain_detect_backend();

    // detect toolchains
    if (test === 'x${toolchains}') {
        if (is_plat('macosx')) {
            toolchains = 'clang gcc';
        } else {
            toolchains = 'gcc clang';
        }
    }
    for (const toolchain of toolchains.split(' ')) {
        if (_toolchain_try(toolchain)) {
            _target_toolchain = toolchain;
            break;
        }
    }
}

const _check_toolchain = () => {
    const toolchain = _target_toolchain;
    _target_toolchain = "";
    _toolchain_detect(toolchain);

    if (`x${_target_toolchain}` !== "x") {
        console.log(`checking for toolchain ... ${_target_toolchain}`);
    } else {
        console.log("checking for toolchain ... no");
        throw new Error("toolchain not found!");
    }
}

const _get_funccode = (func) => {
    let code = "";
    if (string_contains(func, "(")) {
        code = func;
    } else {
        code = `volatile void* p${func} = (void*)&${func};`;
    }
    return code;
}

// 生成cxsnippets源代码
function _generate_cxsnippets_sourcecode(funcs, includes, types, snippets) {
    let snippet_includes = "";
    for (let include of includes) {
        snippet_includes = `${snippet_includes}#include "${include}"\n`;
    }

    let snippet_types = "";
    for (let type of types) {
        let typevar = string_replace(type, '[^a-zA-Z]', "_");
        snippet_types = `${snippet_types}typedef ${type} __type_${typevar};\n`;
    }

    let snippet_funcs = "";
    for (let func of funcs) {
        func = _get_funccode(func);
        snippet_funcs = `${snippet_funcs}${func}\n`;
    }

    let snippets_code = "";
    if (_test_nz(snippet_includes)) {
        snippets_code = `${snippets_code}${snippet_includes}\n`;
    }
    if (_test_nz(snippet_types)) {
        snippets_code = `${snippets_code}${snippet_types}\n`;
    }
    if (_test_nz(snippets)) {
        snippets_code = `${snippets_code}${snippets}\n`;
    }

    return `${snippets_code}int main(int argc, char** argv) { ${snippet_funcs} return 0; }`;
}

// check cxsnippets
function _check_cxsnippets(name, kind) {
    const funcs = _get_option_item(name, `${kind}funcs`);
    const includes = _get_option_item(name, `${kind}includes`);
    const types = _get_option_item(name, `${kind}types`);
    const snippets = _get_option_item(name, `${kind}snippets`);
    const links = _get_option_item(name, "links");
    const syslinks = _get_option_item(name, "syslinks");
    if (_test_z(funcs) && _test_z(includes) && _test_z(types) && _test_z(snippets)) {
        return 0;
    }
    if (_test_nz(syslinks)) {
        links += `${syslinks}`;
    }

    // get c/c++ extension
    let extension = ".c";
    let sourcekind = "cc";
    if (_test_eq(kind, "cxx")) {
        extension = ".cpp";
        sourcekind = "cxx";
    }

    // generate source code
    const sourcecode = _generate_cxsnippets_sourcecode(funcs, includes, types, snippets);
    dprint(sourcecode);

    // generate the source file
    const tmpfile = _os_tmpfile();
    const sourcefile = `${tmpfile}${extension}`;
    const objectfile = `${tmpfile}.o`;
    const binaryfile = `${tmpfile}.bin`;
    fs.writeFileSync(sourcefile, sourcecode);

    // try compiling it
    let ok = false;
    if (!ok) {
        let compflags = "";
        const program = _get_toolchain_toolset(_target_toolchain, sourcekind);
        const toolname = path_toolname(program);
        const itemnames = "languages warnings optimizes defines undefines";
        for (const itemname of itemnames.split(" ")) {
            const flags = _get_option_abstract_flags(name, sourcekind, toolname, itemname);
            if (_test_nz(flags)) {
                compflags += ` ${flags}`;
            }
        }
        const flagnames = "cxflags";
        if (_test_eq(sourcekind, "cxx")) {
            flagnames += " cxxflags";
        } else {
            flagnames += " cflags";
        }
        for (const flagname of flagnames.split(" ")) {
            const flags = _get_option_item(name, flagname);
            if (_test_nz(flags)) {
                compflags += ` ${flags}`;
            }
        }
        const compcmd = _toolchain_compcmd(sourcekind, objectfile, sourcefile, compflags);
        if (xmake_sh_diagnosis) {
            print(`> ${compcmd}`);
        }
        if (_os_runv(compcmd)) {
            ok = true;
        }
    }

    // try linking it
    if (ok && _test_nz(links)) {
        const toolkind = 'ld';
        const program = _get_toolchain_toolset(_target_toolchain, toolkind);
        const toolname = path_toolname(program);
        const itemnames = 'linkdirs links syslinks';
        let linkflags = '';
        for (const itemname of itemnames) {
            const flags = _get_option_abstract_flags(name, toolkind, toolname, itemname);
            if (_test_nz(flags)) {
                linkflags = `${linkflags} ${flags}`;
            }
        }
        const flags = _get_option_item(name, 'ldflags');
        if (_test_nz(flags)) {
            linkflags = `${linkflags} ${flags}`;
        }
        const linkcmd = _toolchain_linkcmd(toolkind, binaryfile, objectfile, linkflags);
        if (xmake_sh_diagnosis) {
            print(`> ${linkcmd}`);
        }
        if (_os_runv(linkcmd)) {
            ok = true;
        } else {
            ok = false;
        }
    }

    // trace
    if (xmake_sh_verbose || xmake_sh_diagnosis) {
        if (_test_nz(includes)) {
            print(`> checking for ${kind} includes(${includes})`);
        }
        if (_test_nz(types)) {
            print(`> checking for ${kind} types(${types})`);
        }
        if (_test_nz(funcs)) {
            print(`> checking for ${kind} funcs(${funcs})`);
        }
        if (_test_nz(links)) {
            print(`> checking for ${kind} links(${links})`);
        }
    }

    // remove files
    _os_tryrm(sourcefile);
    _os_tryrm(objectfile);
    _os_tryrm(binaryfile);
    if (ok) {
        return 0;
    }
    return 1;
}

const _check_csnippets = (name) => {
    if (_check_cxsnippets(name, 'c')) {
        return 0;
    }
    return 1;
}

const _check_cxxsnippets = (name) => {
    if (_check_cxsnippets(name, 'cxx')) {
        return 0;
    }
    return 1;
}

const _check_option = (name) => {
    if (_check_csnippets(name) && _check_cxxsnippets(name)) {
        return 0;
    }
    return 1;
}

const _check_options = () => {
    const options = _get_options_for_checking();
    for (const name of options) {
        if (_check_option(name)) {
            console.log(`checking for ${name} .. ok`);
            _set_option_value(name, true);
        } else {
            console.log(`checking for ${name} .. no`);
            _set_option_value(name, false);
        }
    }
}

const _check_all = () => {
    _check_platform();
    _check_toolchain();
    _check_options();
}
_check_all();

// 初始化内置变量，例如add_headerfiles "${buildir}/config.h"
const projectdir = xmake_sh_projectdir;
let buildir;
if (path_is_absolute(xmake_sh_buildir)) {
    buildir = xmake_sh_buildir;
} else {
    buildir = `${xmake_sh_projectdir}/${xmake_sh_buildir}`;
}

// 加载项目目标
const _load_targets = () => {
    _loading_options = false;
    _loading_toolchains = false;
    _loading_targets = true;
    _xmake_sh_option_current = "";
    _xmake_sh_target_current = "";
    _xmake_sh_toolchain_current = "";
    const file = `${xmake_sh_projectdir}/xmake.sh`;
    if (fs.existsSync(file)) {
        includes(file);
    } else {
        // include all xmake.sh files in next sub-directories
        const files = _os_find(`${xmake_sh_projectdir}`, "xmake.sh", 2);
        files.forEach((file) => {
            includes(file);
        });
    }
}

_load_targets()

// 生成configfiles
// vprint config variable in `${name}`
function _vprint_configvar_value(content, name, value) {
    vprint(`  > replace ${name} -> ${value}`);
}

// vprint config variable in `${define name}`
function _vprint_configvar_define(content, name, value) {
    if (_test_z(value)) {
        vprint(`  > replace ${name} -> /* #undef ${name} */`);
    } else if (_test_eq(value, "1") || _test_eq(value, "true")) {
        vprint(`  > replace ${name} -> #define ${name} 1`);
    } else if (_test_eq(value, "0") || _test_eq(value, "false")) {
        vprint(`  > replace ${name} -> #define ${name} 0`);
    } else {
        vprint(`  > replace ${name} -> #define ${name} ${value}`);
    }
}

const _replace_configvar_define = (content, name, value) => {
    if (_test_z(value)) {
        content = string_replace(content, `\${define ${name}}`, `/*#undef ${name}*/`);
    } else if (_test_eq(value, "1") || _test_eq(value, "true")) {
        content = string_replace(content, `\${define ${name}}, #define ${name} 1`);
    } else if (_test_eq(value, "0") || _test_eq(value, "false")) {
        content = string_replace(content, `\${define ${name}}, /*#define ${name} 0*/`);
    } else {
        content = string_replace(content, `\${define ${name}}, #define ${name} ${value}`);
    }
    return content;
}

const _replace_configvar_value = (content, name, value) => {
    content = string_replace(content, `\${${name}}`, value);
    return content;
}

// 生成给定目标的configfile
function _generate_configfile(target, configfile_in) {
    const configdir = _get_target_item(target, 'configdir');
    if (_test_z(configdir)) {
        configdir = path_directory(configfile_in);
    }
    if (!fs.existsSync(configdir)) {
        fs.mkdirSync(configdir);
    }
    const filename = path_basename(configfile_in);
    const configfile = `${configdir}/${filename}`;
    console.log(`generating ${configfile} ..`);

    // 替换
    let content = fs.readFileSync(configfile_in, 'utf8');

    // 替换版本
    const version = _get_target_item(target, 'version');
    const version_build = _get_target_item(target, 'version_build');
    const version_major = string_split(version, '.', 1);
    const version_minor = string_split(version, '.', 2);
    const version_alter = string_split(version, '.', 3);
    if (_test_nz(version)) {
        _vprint_configvar_value(content, 'VERSION', version);
        content = _replace_configvar_value(content, 'VERSION', version);
    }
    if (_test_nz(version_major)) {
        _vprint_configvar_value(content, 'VERSION_MAJOR', version_major);
        content = _replace_configvar_value(content, 'VERSION_MAJOR', version_major);
    }
    if (_test_nz(version_minor)) {
        _vprint_configvar_value(content, 'VERSION_MINOR', version_minor);
        content = _replace_configvar_value(content, 'VERSION_MINOR', version_minor);
    }
    if (_test_nz(version_alter)) {
        _vprint_configvar_value(content, 'VERSION_ALTER', version_alter);
        content = _replace_configvar_value(content, 'VERSION_ALTER', version_alter);
    }
    if (_test_nz(version_build)) {
        version_build = _os_date(version_build);
        _vprint_configvar_value(content, 'VERSION_BUILD', version_build);
        content = _replace_configvar_value(content, 'VERSION_BUILD', version_build);
    }

    // replace git variables
    if (string_contains(content, 'GIT_')) {
        const git_tag = _os_iorunv('git', 'describe', '--tags')
        if (_test_nz(git_tag)) {
            _vprint_configvar_value(content, 'GIT_TAG', git_tag)
            content = _replace_configvar_value(content, 'GIT_TAG', git_tag)
        }
        const git_tag_long = _os_iorunv('git', 'describe', '--tags', '--long')
        if (_test_nz(git_tag_long)) {
            _vprint_configvar_value(content, 'GIT_TAG_LONG', git_tag_long)
            content = _replace_configvar_value(content, 'GIT_TAG_LONG', git_tag_long)
        }
        const git_branch = _os_iorunv('git', 'rev-parse', '--abbrev-ref', 'HEAD')
        if (_test_nz(git_branch)) {
            _vprint_configvar_value(content, 'GIT_BRANCH', git_branch)
            content = _replace_configvar_value(content, 'GIT_BRANCH', git_branch)
        }
        const git_commit = _os_iorunv('git', 'rev-parse', '--short', 'HEAD')
        if (_test_nz(git_commit)) {
            _vprint_configvar_value(content, 'GIT_COMMIT', git_commit)
            content = _replace_configvar_value(content, 'GIT_COMMIT', git_commit)
        }
        if (_test_nz(git_commit_long)) {
            _vprint_configvar_value(content, "GIT_COMMIT_LONG", git_commit_long);
            content = _replace_configvar_value(content, "GIT_COMMIT_LONG", git_commit_long);
        }
        let git_commit_date = _os_iorunv("log", "-1", "--date=format:%Y%m%d%H%M%S", "--format=%ad");
        if (_test_nz(git_commit_date)) {
            _vprint_configvar_value(content, "GIT_COMMIT_DATE", git_commit_date);
            content = _replace_configvar_value(content, "GIT_COMMIT_DATE", git_commit_date);
        }
    }

    // 替换目标中的配置变量
    let configvars = _get_target_item(target, "configvars");
    for (let name of configvars) {
        let value = _get_target_item(target, `configvar_${name}`);
        _vprint_configvar_define(content, name, value);
        _vprint_configvar_value(content, name, value);
        content = _replace_configvar_define(content, name, value);
        content = _replace_configvar_value(content, name, value);
    }

    // replace configvars in target/options
    const options = _get_target_item(target, "options").split(" ");
    for (const option of options) {
        const configvars = _get_option_item(option, "configvars").split(" ");
        for (const name of configvars) {
            const value = _get_option_item(option, `configvar_${name}`);
            if (!has_config(option)) {
                value = "";
            }
            _vprint_configvar_define(content, name, value);
            _vprint_configvar_value(content, name, value);
            content = _replace_configvar_define(content, name, value);
            content = _replace_configvar_value(content, name, value);
        }
    }

    // done
    fs.writeFileSync(configfile, content);
    console.log(`${configfile} is generated!`);
}

// generate configfiles
function _generate_configfiles() {
    for (const target of _xmake_sh_targets) {
        const configfiles = _get_target_item(target, "configfiles");
        for (const configfile of configfiles) {
            _generate_configfile(target, configfile);
        }
    }
}
_generate_configfiles();

//-----------------------------------------------------------------------------
// generate gmake file
//

function _gmake_begin() {
    console.log("generating makefile ..");
}

function _gmake_add_header() {
    fs.writeFileSync(`${xmake_sh_projectdir}/Makefile`, `# this is the build file for this project
# it is autogenerated by the xmake.sh build system.
# do not edit by hand.
`, { encoding: "utf8" });
}

function _gmake_add_switches() {
    fs.appendFileSync(`${xmake_sh_projectdir}/Makefile`, `ifneq (\$(VERBOSE),1)
V=@
endif

`, { encoding: "utf8" });
}

function _gmake_add_flags() {
    const kinds = "cc cxx as mm mxx ld sh ar";
    for (const target of _xmake_sh_targets) {
        for (const kind of kinds) {
            const flags = _get_target_flags(target, kind);
            const flagname = _get_flagname(kind);
            fs.appendFileSync(`${xmake_sh_projectdir}/Makefile`, `${string_toupper(`${target}_${flagname}`)}=${flags}
`, { encoding: "utf8" });
        }
        fs.appendFileSync(`${xmake_sh_projectdir}/Makefile`, "\n", { encoding: "utf8" });
    }
}

function _gmake_add_toolchains() {
    const kinds = "cc cxx as mm mxx ld sh ar";
    for (const kind of kinds) {
        const program = _get_toolchain_toolset(_target_toolchain, kind);
        fs.appendFileSync(`${xmake_sh_projectdir}/Makefile`, `${string_toupper(kind)}=${program}
`, { encoding: "utf8" });
    }
    fs.appendFileSync(`${xmake_sh_projectdir}/Makefile`, "\n", { encoding: "utf8" });
}

_gmake_add_build_object_for_gcc_clang = (kind, sourcefile, objectfile, flagname) => {
    const objectdir = path_directory(objectfile);
    print(`\t@mkdir -p ${objectdir}`);
    print(`\t$(V)$(${kind}) -c $(${flagname}) -o ${objectfile} ${sourcefile}`);
}

_gmake_add_build_object = (target, sourcefile, objectfile) => {
    const sourcekind = path_sourcekind(sourcefile);
    const program = _get_toolchain_toolset(_target_toolchain, sourcekind);
    const toolname = path_toolname(program);
    const flagname = _get_flagname(sourcekind);
    flagname = string_toupper(`${target}_${flagname}`);
    echo(`${objectfile}: ${sourcefile}`);
    print(`\t@echo compiling.${_target_mode} ${sourcefile}`);
    switch (toolname) {
        case "gcc":
            _gmake_add_build_object_for_gcc_clang(sourcekind, sourcefile, objectfile, flagname);
            break;
        case "gxx":
            _gmake_add_build_object_for_gcc_clang(sourcekind, sourcefile, objectfile, flagname);
            break;
        case "clang":
            _gmake_add_build_object_for_gcc_clang(sourcekind, sourcefile, objectfile, flagname);
            break;
        case "clangxx":
            _gmake_add_build_object_for_gcc_clang(sourcekind, sourcefile, objectfile, flagname);
            break;
        default:
            raise("unknown toolname(${toolname})!");
    }
    echo("");
}

_gmake_add_build_objects = (target) => {
    const sourcefiles = _get_target_sourcefiles(target);
    for (const sourcefile of sourcefiles) {
        const objectfile = _get_target_objectfile(target, sourcefile);
        _gmake_add_build_object(target, sourcefile, objectfile);
    }
}

_gmake_add_build_target_for_gcc_clang = (kind, targetfile, objectfiles, flagname) => {
    const targetdir = path_directory(targetfile);
    print(`\t@mkdir -p ${targetdir}`);
    print(`\t$(V)$(${kind}) -o ${targetfile} ${objectfiles} $(${flagname})`);
}

_gmake_add_build_target_for_ar = (kind, targetfile, objectfiles, flagname) => {
    const targetdir = path_directory(targetfile);
    print(`\t@mkdir -p ${targetdir}`);
    print(`\t$(V)$(${kind}) crs ${targetfile} ${objectfiles} $(${flagname})`);
}

function _gmake_add_build_target(target) {
    const targetdir = _get_targetdir(target);
    const targetfile = _get_target_file(target);
    const deps = _get_target_item(target, "deps");
    const objectfiles = _get_target_objectfiles(target);

    // get linker
    const targetkind = _get_target_item(target, "kind");
    let toolkind = "";
    switch (targetkind) {
        case "binary":
            toolkind = "ld";
            break;
        case "static":
            toolkind = "ar";
            break;
        case "shared":
            toolkind = "sh";
            break;
        default:
            raise("unknown targetkind(" + targetkind + ")!");
            break;
    }
    const program = _get_toolchain_toolset(_target_toolchain, toolkind);
    const toolname = path_toolname(program);

    // get linker flags
    const flagname = _get_flagname(toolkind);
    flagname = string_toupper(target + "_" + flagname);

    // link target
    echo(target + ": " + targetfile + " >> " + xmake_sh_projectdir + "/Makefile");
    echo(targetfile + ": " + deps + objectfiles + " >> " + xmake_sh_projectdir + "/Makefile");
    print("\t@echo linking." + _target_mode + " " + targetfile + " >> " + xmake_sh_projectdir + "/Makefile");
    switch (toolname) {
        case "gcc":
            _gmake_add_build_target_for_gcc_clang(toolkind, targetfile, objectfiles, flagname);
            break;
        case "gxx":
            _gmake_add_build_target_for_gcc_clang(toolkind, targetfile, objectfiles, flagname);
            break;
        case "clang":
            _gmake_add_build_target_for_gcc_clang(toolkind, targetfile, objectfiles, flagname);
            break;
        case "clangxx":
            _gmake_add_build_target_for_gcc_clang(toolkind, targetfile, objectfiles, flagname);
            break;
        case "ar":
            _gmake_add_build_target_for_ar(toolkind, targetfile, objectfiles, flagname);
            break;
        default:
            raise("unknown toolname(" + toolname + ")!");
            break;
    }
    echo(" >> " + xmake_sh_projectdir + "/Makefile");

    // build objects
    _gmake_add_build_objects(target);
}

const _gmake_add_build_targets = () => {
    let defaults = "";
    for (const target of _xmake_sh_targets) {
        if (_is_target_default(target)) {
            defaults += ` ${target}`;
        }
    }
    echo(`default:${defaults} >> "${xmake_sh_projectdir}/Makefile"`);
    echo(`all:${_xmake_sh_targets} >> "${xmake_sh_projectdir}/Makefile"`);
    echo(".PHONY: default all >> ${xmake_sh_projectdir}/Makefile");
    echo(" >> ${xmake_sh_projectdir}/Makefile");
    for (const target of _xmake_sh_targets) {
        _gmake_add_build_target(target);
    }
};

const _gmake_add_build = () => {
    _gmake_add_build_targets();
};

const _gmake_add_run_target = (target) => {
    const targetfile = _get_target_file(target);
    print(`\t@${targetfile} >> "${xmake_sh_projectdir}/Makefile"`);
};

const _gmake_add_run_targets = () => {
    let targets = "";
    for (const target of _xmake_sh_targets) {
        const kind = _get_target_item(target, "kind");
        if (test("x${kind}" === "xbinary")) {
            if (_is_target_default(target)) {
                targets += ` ${target}`;
            }
        }
    }
    echo(`run:${targets} >> "${xmake_sh_projectdir}/Makefile"`);
    for (const target of targets) {
        _gmake_add_run_target(target);
    }
    echo(" >> ${xmake_sh_projectdir}/Makefile");
};

const _gmake_add_run = () => {
    _gmake_add_run_targets();
};

const _gmake_add_clean_target = (target) => {
    const targetfile = _get_target_file(target);
    const objectfiles = _get_target_objectfiles(target);
    print(`\t@rm ${targetfile} >> "${xmake_sh_projectdir}/Makefile"`);
    for (const objectfile of objectfiles) {
        print(`\t@rm ${objectfile} >> "${xmake_sh_projectdir}/Makefile"`);
    }
};

function _gmake_add_clean_targets() {
    const targets = "";
    for (const target of _xmake_sh_targets) {
        if (_is_target_default(target)) {
            targets += ` ${target}`;
        }
    }
    fs.appendFileSync(`${xmake_sh_projectdir}/Makefile`, `clean:${targets}\n`);
    for (const target of targets) {
        _gmake_add_clean_target(target);
    }
    fs.appendFileSync(`${xmake_sh_projectdir}/Makefile`, "\n");
}

function _gmake_add_clean() {
    _gmake_add_clean_targets();
}

function _gmake_add_install_target(target) {
    const targetfile = _get_target_file(target);
    const filename = path_filename(targetfile);
    let installdir = _get_target_item(target, "installdir");
    if (_test_z(installdir)) {
        installdir = _install_prefix_default;
    }

    // install target file
    const targetkind = _get_target_item(target, "kind");
    if (_test_eq(targetkind, "binary")) {
        print(`\t@mkdir -p ${installdir}/${_install_bindir_default}` >> `${xmake_sh_projectdir}/Makefile`);
        print(`\t@cp -p ${targetfile} ${installdir}/${_install_bindir_default}/${filename}` >> `${xmake_sh_projectdir}/Makefile`);
    } else if (_test_eq(targetkind, "static") || _test_eq(targetkind, "shared")) {
        print(`\t@mkdir -p ${installdir}/${_install_libdir_default}` >> `${xmake_sh_projectdir}/Makefile`);
        print(`\t@cp -p ${targetfile} ${installdir}/${_install_libdir_default}/${filename}` >> `${xmake_sh_projectdir}/Makefile`);
    }

    // install header files
    const headerfiles = _get_target_item(target, "headerfiles");
    if (_test_nz(headerfiles)) {
        const includedir = `${installdir}/${_install_includedir_default}`;
        for (const srcheaderfile of headerfiles) {
            const rootdir = string_split(srcheaderfile, ":", 2);
            const prefixdir = string_split(srcheaderfile, ":", 3);
            srcheaderfile = string_split(srcheaderfile, ":", 1);
            const filename = path_filename(srcheaderfile);
            let dstheaderdir = includedir;
            if (_test_nz(prefixdir)) {
                dstheaderdir = `${dstheaderdir}/${prefixdir}`;
            }
            const dstheaderfile = `${dstheaderdir}/${filename}`;
            if (_test_nz(rootdir)) {
                const subfile = path_relative(rootdir, srcheaderfile);
                dstheaderfile = `${dstheaderdir}/${subfile}`;
            }
            dstheaderdir = path_directory(dstheaderfile);
            print(`\t@mkdir -p ${dstheaderdir}` >> `${xmake_sh_projectdir}/Makefile`);
            print(`\t@cp -p ${srcheaderfile} ${dstheaderfile}` >> `${xmake_sh_projectdir}/Makefile`);
        }
    }
    // 安装用户文件
    const installfiles = _get_target_item(target, "installfiles");
    if (_test_nz(installfiles)) {
        for (const srcinstallfile of installfiles) {
            const rootdir = string_split(srcinstallfile, ":", 2);
            const prefixdir = string_split(srcinstallfile, ":", 3);
            srcinstallfile = string_split(srcinstallfile, ":", 1);
            const filename = path_filename(srcinstallfile);
            let dstinstalldir = installdir;
            if (_test_nz(prefixdir)) {
                dstinstalldir = `${dstinstalldir}/${prefixdir}`;
            }
            let dstinstallfile = `${dstinstalldir}/${filename}`;
            if (_test_nz(rootdir)) {
                const subfile = path_relative(rootdir, srcinstallfile);
                dstinstallfile = `${dstinstalldir}/${subfile}`;
            }
            dstinstalldir = path_directory(dstinstallfile);
            print(`\t@mkdir -p ${dstinstalldir}` >> "${xmake_sh_projectdir}/Makefile");
            print(`\t@cp -p ${srcinstallfile} ${dstinstallfile}` >> "${xmake_sh_projectdir}/Makefile");
        }
    }
}

const _gmake_add_install_targets = () => {
    let targets = "";
    for (const target of _xmake_sh_targets) {
        if (_is_target_default(target)) {
            targets += `${target}`;
        }
    }
    fs.appendFileSync(`${xmake_sh_projectdir}/Makefile`, `install:${targets}\n`);
    for (const target of targets) {
        _gmake_add_install_target(target);
    }
    fs.appendFileSync(`${xmake_sh_projectdir}/Makefile`, "\n");
};

const _gmake_add_install = () => {
    _gmake_add_install_targets();
};

const _gmake_done = () => {
    console.log("makefile is generated!");
};

const _generate_for_gmake = () => {
    _gmake_begin();
    _gmake_add_header();
    _gmake_add_switches();
    _gmake_add_toolchains();
    _gmake_add_flags();
    _gmake_add_build();
    _gmake_add_clean();
    _gmake_add_install();
    _gmake_add_run();
    _gmake_done();
};

//-----------------------------------------------------------------------------
// generate ninja file
//

// generate build file for ninja
function _generate_for_ninja() {
    throw new Error("Ninja generator has been not supported!");
}

//-----------------------------------------------------------------------------
// generate build file
//

function _generate_build_file() {
    if (`x${_project_generator}` === "xgmake") {
        _generate_for_gmake();
    } else if (`x${_project_generator}` === "xninja") {
        _generate_for_ninja();
    } else {
        throw new Error(`unknown generator: ${_project_generator}`);
    }
}
_generate_build_file();

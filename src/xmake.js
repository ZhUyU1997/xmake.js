set_project("hello")
set_version("1.0.1", "%Y%m%d%H%M")

option("debug", "Enable debug compilation mode.", false)
option("tests", "Enable tests.", true)

option("pthread")
    add_links("pthread")
    add_cincludes("pthread.h")
    add_cfuncs("pthread_create")
option_end()

option("cxx_constexpr")
    set_languages("c++11")
    add_cxxsnippets("constexpr int k = 0;")
option_end()

set_warnings("all", "error")
set_languages("c99", "c++11")

if (is_mode("debug")) {
    set_symbols("debug")
    set_optimizes("none")
}
else {
    set_strip("all")
    set_symbols("hidden")
    set_optimizes("smallest")
}


target("demo")
    set_kind("binary")
    add_deps("foo", "bar")
    add_files("*.cpp")
    add_includedirs("foo", "bar")
    add_configfiles("config.h.in")
    set_configdir(`${buildir}/include`)
    add_headerfiles(`${buildir}/include/config.h`, "hello")
    add_headerfiles("(bar/*.h)", "hello")
    add_headerfiles("foo/(*.h)", "hello")
    add_installfiles("res/(png/*.png)", "share")
    if (has_config("debug"))
        add_defines("DEBUG", "TEST")

    if (is_plat("linux", "macosx"))
        add_defines("POSIX")
    if (has_config("pthread"))
        set_configvar("HAS_PTHREAD", 1)

    if (has_config("cxx_constexpr"))
        set_configvar("HAS_CONSTEXPR", 1)


includes("foo", "bar")
if (has_config("tests"))
    includes("tests")


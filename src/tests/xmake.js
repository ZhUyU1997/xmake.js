const tests = ["test1", "test2"]
for (const name of tests) {
    target(`${name}`)
        set_kind("binary")
        add_files(`${name}.cpp`)
}

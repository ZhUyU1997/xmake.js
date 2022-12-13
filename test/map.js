const maps = new Map(); // 用来存储所有映射的集合

// 返回给定名称的映射
const _map = name => {
    return maps.get(name);
};

// 返回给定名称的映射中键值对的数量
const _map_count = name => {
    const map = maps.get(name);
    if (!map) return 0;
    return map.size;
};

// 返回给定名称的映射中指定 key 对应的值
const _map_get = (name, key) => {
    const map = maps.get(name);
    if (!map) return undefined;
    return map.get(key);
};

// 判断给定名称的映射中是否存在指定 key
const _map_has = (name, key) => {
    const map = maps.get(name);
    if (!map) return false;
    return map.has(key);
};

// 在给定名称的映射中设置指定 key 对应的值
const _map_set = (name, key, value) => {
    let map = maps.get(name);
    if (!map) {
        map = new Map();
        maps.set(name, map);
    }
    map.set(key, value);
};

// 在给定名称的映射中移除指定 key
const _map_remove = (name, key) => {
    const map = maps.get(name);
    if (!map) return;
    map.delete(key);
};

// 返回给定名称的映射中所有 key 的数组
const _map_keys = name => {
    const map = maps.get(name);
    if (!map) return [];
    return Array.from(map.keys());
};

const myMap = _map('myMap');
_map_set('myMap', 'name', 'Alice');
_map_set('myMap', 'age', 18);
_map_set('myMap', 'gender', 'Female');
console.log(_map_count('myMap')); // 3
console.log(_map_get('myMap', 'name')); // Alice
console.log(_map_has('myMap', 'name')); // true
console.log(_map_has('myMap', 'email')); // false
_map_remove('myMap', 'name');
console.log(_map_has('myMap', 'name')); // false
console.log(_map_keys('myMap')); // ['age', 'gender']
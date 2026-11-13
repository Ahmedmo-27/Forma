import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const routesDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../routes");

const KINDS = [
    { kind: "allowRoles", name: "allowRoles", min: 2 },
    { kind: "allowAnyFeature", name: "allowAnyFeature", min: 2 },
    { kind: "authorizeRoles", name: "authorizeRoles", min: 1 },
    { kind: "requireFeature", name: "requireFeature", min: 1, max: 1 },
    { kind: "requireAccess", name: "requireAccess", min: 1, max: 1 },
];

function readBalanced(source, openIndex, where) {
    let depth = 1;
    let i = openIndex;
    let quote = null;
    while (i < source.length && depth > 0) {
        const char = source[i];
        if (quote) {
            if (char === "\\") {
                i += 2;
                continue;
            }
            if (char === quote) quote = null;
            i += 1;
            continue;
        }
        if (char === '"' || char === "'") {
            quote = char;
            i += 1;
            continue;
        }
        if (char === "(") depth += 1;
        else if (char === ")") depth -= 1;
        i += 1;
    }
    if (depth !== 0 || quote) throw new Error(`Unclosed call in ${where}`);
    return { argsSrc: source.slice(openIndex, i - 1), end: i };
}

function parseStrings(argsSrc, where) {
    const strings = [];
    const re = /"([^"\\]*)"|'([^'\\]*)'/g;
    let match;
    let last = 0;
    while ((match = re.exec(argsSrc))) {
        const between = argsSrc.slice(last, match.index);
        if (!/^[\s,\[\]]*$/.test(between)) {
            throw new Error(`Unparsed argument in ${where}: ${JSON.stringify(between)}`);
        }
        strings.push(match[1] ?? match[2]);
        last = match.index + match[0].length;
    }
    const tail = argsSrc.slice(last);
    if (!/^[\s,\[\]]*$/.test(tail)) {
        throw new Error(`Unparsed tail in ${where}: ${JSON.stringify(tail)}`);
    }
    return strings;
}

function classify(kind, strings, argsSrc, where) {
    if (kind === "allowRoles") {
        return { feature: strings[0], features: [strings[0]], roles: strings.slice(1) };
    }
    if (kind === "allowAnyFeature") {
        if (!argsSrc.trimStart().startsWith("[")) {
            throw new Error(`allowAnyFeature in ${where} must start with a feature array`);
        }
        const close = argsSrc.indexOf("]");
        if (close < 0) throw new Error(`allowAnyFeature in ${where} is missing ]`);
        const features = parseStrings(argsSrc.slice(0, close + 1), where);
        const roles = parseStrings(argsSrc.slice(close + 1), where);
        if (!features.length || !roles.length) {
            throw new Error(`allowAnyFeature in ${where} needs features and roles`);
        }
        return { features, roles };
    }
    if (kind === "authorizeRoles") return { roles: strings };
    if (kind === "requireFeature") return { feature: strings[0] };
    return { area: strings[0] };
}

function bindingName(source, index) {
    const before = source.slice(Math.max(0, index - 80), index);
    const match = before.match(/(?:const|let)\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*$/);
    return match ? match[1] : null;
}

function pairedFeatures(source, call) {
    const found = new Set();
    const window = source.slice(call.end, call.end + 500);
    const routerAt = window.search(/\brouter\./);
    const featureAt = window.search(/requireFeature\s*\(/);
    if (featureAt !== -1 && (routerAt === -1 || featureAt < routerAt)) {
        const match = window.slice(featureAt).match(/requireFeature\s*\(\s*["']([^"']+)["']/);
        if (match) found.add(match[1]);
    }
    if (call.binding) {
        const re = new RegExp(`\\b${call.binding}\\s*,\\s*requireFeature\\(\\s*["']([^"']+)["']`, "g");
        let match;
        while ((match = re.exec(source))) found.add(match[1]);
    }
    return [...found];
}

export function loadRouteCalls() {
    const files = fs.readdirSync(routesDir).filter((name) => name.endsWith("Routes.js")).sort();
    const calls = [];
    for (const file of files) {
        const source = fs.readFileSync(path.join(routesDir, file), "utf8");
        for (const spec of KINDS) {
            const re = new RegExp(`\\b${spec.name}\\s*\\(`, "g");
            let match;
            while ((match = re.exec(source))) {
                const line = source.slice(0, match.index).split("\n").length;
                const where = `${file}:${line}`;
                const { argsSrc, end } = readBalanced(source, match.index + match[0].length, where);
                const strings = parseStrings(argsSrc, where);
                if (strings.length < spec.min || (spec.max && strings.length > spec.max)) {
                    throw new Error(`${spec.name} in ${where} has ${strings.length} string arguments`);
                }
                const call = {
                    kind: spec.kind,
                    where,
                    file,
                    end,
                    binding: bindingName(source, match.index),
                    ...classify(spec.kind, strings, argsSrc, where),
                };
                if (spec.kind === "allowRoles" || spec.kind === "allowAnyFeature") {
                    call.planFeatures = pairedFeatures(source, call);
                }
                calls.push(call);
            }
        }
    }
    return calls;
}

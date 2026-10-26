import { faCompare, faCompareCode, faNormalizeKey } from "../src/lib/fa-sort";
console.log("norm آمنه:", faNormalizeKey("آمنه"), "| norm احمد:", faNormalizeKey("احمد"));
console.log("faCompare(آمنه,احمد) =", faCompare("آمنه", "احمد"));
console.log("faCompare(احمد,آمنه) =", faCompare("احمد", "آمنه"));
console.log("faCompare(آمنه,امنه) =", faCompare("آمنه", "امنه"));
const codes = ["۱۰۰۲۰", "۵۹۱۱۵", "۹۹", "۱۰۰"];
console.log("codes sorted:", [...codes].sort((a, b) => faCompareCode(a, b)));

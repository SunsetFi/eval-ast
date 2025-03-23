import { StringLiteral } from "@babel/types";
import { StaticJsString } from "../../runtime/index.js";
import EvaluationGenerator from "../EvaluationGenerator.js";

export default function* stringLiteralNodeEvaluator(
  node: StringLiteral,
): EvaluationGenerator {
  return StaticJsString(node.value);
}

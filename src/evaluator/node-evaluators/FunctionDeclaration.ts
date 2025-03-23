import { FunctionDeclaration } from "@babel/types";

import createFunction from "./Function.js";
import typedMerge from "../../internal/typed-merge.js";
import EvaluationGenerator from "../EvaluationGenerator.js";
import EvaluationContext from "../EvaluationContext.js";
import EnvironmentSetupGenerator from "../EnvironmentSetupGenerator.js";

function* functionDeclarationNodeEvaluator(): EvaluationGenerator {
  return null;
}

function* functionDeclarationEnvironmentSetup(
  node: FunctionDeclaration,
  context: EvaluationContext,
): EnvironmentSetupGenerator {
  const functionName = node.id?.name ?? null;
  const func = createFunction(functionName, node, context);

  if (functionName) {
    // So apparently you can actually redeclare these in NodeJS.
    context.env.createMutableBinding(functionName, false);

    // Strict mode is whatever here; our binding will always exist, as it is
    // created above.
    context.env.setMutableBinding(functionName, func, true);
  }

  return false;
}

export default typedMerge(functionDeclarationNodeEvaluator, {
  environmentSetup: functionDeclarationEnvironmentSetup,
});

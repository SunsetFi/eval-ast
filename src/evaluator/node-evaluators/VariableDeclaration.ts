import { VariableDeclaration, VariableDeclarator } from "@babel/types";

import { StaticJsValue, StaticJsUndefined } from "../../runtime/index.js";

import { evaluateNodeAssertValue } from "./nodes.js";
import { NodeEvaluationContext } from "./node-evaluation-context.js";
import setLVal from "./LVal.js";
import typedMerge from "../../internal/typed-merge.js";

function variableDeclarationNodeEvaluator(
  node: VariableDeclaration,
  context: NodeEvaluationContext,
): null {
  let variableInitializer: (name: string, value: StaticJsValue | null) => void;
  switch (node.kind) {
    case "const":
    case "let":
      variableInitializer = (name, value) => {
        context.env.initializeBinding(name, value ?? StaticJsUndefined());
      };
      break;
    case "var":
      variableInitializer = (name, value) => {
        context.env.setMutableBinding(
          name,
          value ?? StaticJsUndefined(),
          context.realm.strict,
        );
      };
      break;
    default:
      throw new Error(`Unsupported variable declaration kind: ${node.kind}`);
  }

  for (const declarator of node.declarations) {
    declarationStatementEvaluator(declarator, context, variableInitializer);
  }

  return null;
}

function variableDeclarationEnvironmentSetup(
  node: VariableDeclaration,
  context: NodeEvaluationContext,
): boolean {
  let variableCreator: (name: string, value: StaticJsValue | null) => void;
  switch (node.kind) {
    case "const":
      variableCreator = (name, value) => {
        context.env.createImmutableBinding(name, context.realm.strict);
      };
      break;
    case "let":
      variableCreator = (name, value) => {
        context.env.createMutableBinding(name, false);
      };
      break;
    case "var":
      variableCreator = (name, value) => {
        if (context.env.canDeclareGlobalVar(name)) {
          context.env.createGlobalVarBinding(name, true);
        } else {
          context.env.createMutableBinding(name, false);
        }
      };
      break;
    default:
      throw new Error(`Unsupported variable declaration kind: ${node.kind}`);
  }

  for (const declarator of node.declarations) {
    setLVal(declarator.id, StaticJsUndefined(), context, variableCreator);
  }

  return false;
}

export default typedMerge(variableDeclarationNodeEvaluator, {
  environmentSetup: variableDeclarationEnvironmentSetup,
});

function declarationStatementEvaluator(
  declarator: VariableDeclarator,
  context: NodeEvaluationContext,
  variableCreator: (name: string, value: StaticJsValue | null) => void,
): void {
  let value: StaticJsValue | null = null;
  if (declarator.init) {
    value = evaluateNodeAssertValue(declarator.init, context);
  }

  setLVal(declarator.id, value, context, variableCreator);
}

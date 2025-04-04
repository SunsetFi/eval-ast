import { UnaryExpression } from "@babel/types";

import { isStaticJsObjectLike } from "../../runtime/types/interfaces/StaticJsObject.js";
import toPropertyKey from "../../runtime/types/utils/to-property-key.js";

import EvaluationGenerator from "../EvaluationGenerator.js";
import { EvaluateNodeCommand } from "../commands/index.js";
import EvaluationContext from "../EvaluationContext.js";
import { NormalCompletion, ThrowCompletion } from "../completions/index.js";

export default function* unaryExpressionNodeEvaluator(
  node: UnaryExpression,
  context: EvaluationContext,
): EvaluationGenerator {
  if (node.operator === "delete") {
    return yield* deleteExpressionNodeEvaluator(node, context);
  }

  if (node.operator === "typeof") {
    return yield* typeofExpressionNodeEvaluator(node, context);
  }

  // Note: In the case of 'void', this is never used.
  // But it still can have side-effects.
  const valueCompletion = yield* EvaluateNodeCommand(node.argument, context);
  if (valueCompletion.type === "throw") {
    return valueCompletion;
  }
  if (valueCompletion.type !== "normal" || !valueCompletion.value) {
    throw new Error(
      "Expected unary expression argument to be normal completion, but got undefined",
    );
  }
  const value = valueCompletion.value;

  const types = context.realm.types;
  switch (node.operator) {
    case "!":
      return NormalCompletion(types.boolean(!value.toJs()));
    // I'm reasonably sure native javascript converts these to number for these operations.
    // Typescript doesn't like it though, so let's cast it ourselves.
    case "-":
      return NormalCompletion(types.number(-value.toNumber()));
    case "+":
      return NormalCompletion(types.number(+value.toNumber()));
    case "~":
      return NormalCompletion(types.number(~value.toNumber()));
    case "void":
      return NormalCompletion(types.undefined);
    case "throw":
      return ThrowCompletion(value);
  }

  throw new Error(`Unknown unary operator: ${node.operator}.`);
}

function* deleteExpressionNodeEvaluator(
  node: UnaryExpression,
  context: EvaluationContext,
): EvaluationGenerator {
  // FIXME: This seems weird and jank.  Validate that this logic is correct.

  const argument = node.argument;
  if (argument.type === "MemberExpression") {
    const objectCompletion = yield* EvaluateNodeCommand(
      argument.object,
      context,
    );
    if (objectCompletion.type === "throw") {
      return objectCompletion;
    }
    if (objectCompletion.type !== "normal" || !objectCompletion.value) {
      throw new Error(
        "Expected object completion to return a value, but got undefined",
      );
    }
    const object = objectCompletion.value;

    if (!isStaticJsObjectLike(object)) {
      // FIXME: Use real error.
      // FIXME: This might actualy be allowed... Delete is weird.
      return ThrowCompletion(
        context.realm.types.string("Cannot delete property of non-object."),
      );
    }

    const property = argument.property;
    let propertyName: string;
    if (!argument.computed && property.type === "Identifier") {
      propertyName = property.name;
    } else {
      const resolved = yield* EvaluateNodeCommand(property, context);
      if (resolved.type === "throw") {
        return resolved;
      }
      if (resolved.type !== "normal" || !resolved.value) {
        throw new Error(
          "Expected property completion to return a value, but got undefined",
        );
      }

      propertyName = toPropertyKey(resolved.value);
    }

    const result = yield* object.deletePropertyEvaluator(propertyName);
    return NormalCompletion(context.realm.types.boolean(result));
  } else if (argument.type === "Identifier") {
    const env = context.env;
    const name = argument.name;
    yield* env.deleteBindingEvaluator(name);

    // We just return true regardless apparently?
    return NormalCompletion(context.realm.types.true);
  }

  // ???
  // `delete 4` returns true???
  return NormalCompletion(context.realm.types.true);
}

function* typeofExpressionNodeEvaluator(
  node: UnaryExpression,
  context: EvaluationContext,
): EvaluationGenerator {
  const argument = node.argument;
  if (argument.type === "Identifier") {
    const name = argument.name;
    const env = context.env;
    const hasBinding = yield* env.hasBindingEvaluator(name);
    if (hasBinding) {
      const bindingValue = yield* env.getBindingValueEvaluator(name, false);
      return NormalCompletion(context.realm.types.string(bindingValue.typeOf));
    }
    return NormalCompletion(context.realm.types.string("undefined"));
  } else {
    const valueCompletion = yield* EvaluateNodeCommand(argument, context);
    if (valueCompletion.type === "throw") {
      return valueCompletion;
    }
    if (valueCompletion.type !== "normal" || !valueCompletion.value) {
      throw new Error(
        "Expected typeof expression argument to be normal completion, but got undefined",
      );
    }
    const value = valueCompletion.value;
    return NormalCompletion(context.realm.types.string(value.typeOf));
  }
}

import { LVal, isLVal } from "@babel/types";

import {
  isStaticJsArray,
  isStaticJsObject,
  isStaticJsUndefined,
  isStaticJsValue,
  StaticJsValue,
} from "../../runtime/index.js";
import toPropertyKey from "../../runtime/types/utils/to-property-key.js";

import { EvaluateNodeCommand } from "../commands/index.js";
import { NormalCompletion, ThrowCompletion } from "../completions/index.js";

import EvaluationContext from "../EvaluationContext.js";
import EvaluationGenerator from "../EvaluationGenerator.js";
import StaticJsEngineError from "../StaticJsEngineError.js";

export default function setLVal(
  lval: LVal,
  value: StaticJsValue,
  context: EvaluationContext,
  setNamedVariable: (
    name: string,
    value: StaticJsValue,
  ) => EvaluationGenerator<void>,
): EvaluationGenerator;
export default function setLVal(
  lval: LVal,
  value: StaticJsValue | null,
  context: EvaluationContext,
  setNamedVariable: (
    name: string,
    value: StaticJsValue | null,
  ) => EvaluationGenerator<void>,
): EvaluationGenerator;
export default function* setLVal(
  lval: LVal,
  value: StaticJsValue | null,
  context: EvaluationContext,
  _setNamedVariable: (
    name: string,
    value: StaticJsValue,
  ) => EvaluationGenerator<void>,
): EvaluationGenerator {
  if (value && !isStaticJsValue(value)) {
    throw new StaticJsEngineError("Cannot set LVal to non-StaticJsValue");
  }

  // Type hack: Our overloads force us to either be nullable or non-nullable,
  // but the variance of the function doesn't actually let us have either-or.
  const setNamedVariable = _setNamedVariable as (
    name: string,
    value: StaticJsValue | null,
  ) => EvaluationGenerator<void>;

  switch (lval.type) {
    case "Identifier":
      yield* setNamedVariable(lval.name, value);
      return NormalCompletion(null);
    case "ArrayPattern": {
      if (!isStaticJsArray(value)) {
        // FIXME: Use real error.
        return ThrowCompletion(
          context.realm.types.string("Cannot destructure non-array value"),
        );
      }

      for (let index = 0; index < lval.elements.length; index++) {
        const element = lval.elements[index];
        if (element === null) {
          continue;
        }

        const property = String(index);
        if (element.type === "RestElement") {
          const restValue = yield* value.sliceEvaluator(index);
          return yield* setLVal(
            element.argument,
            restValue,
            context,
            setNamedVariable,
          );
        } else {
          const elementValue = yield* value.getPropertyEvaluator(property);
          return yield* setLVal(
            element,
            elementValue,
            context,
            setNamedVariable,
          );
        }
      }

      return NormalCompletion(null);
    }
    case "ObjectPattern": {
      if (!isStaticJsObject(value)) {
        // FIXME: Use real error.
        return ThrowCompletion(
          context.realm.types.string("Cannot destructure non-object value"),
        );
      }

      const seenProperties = new Set<string>();
      for (const property of lval.properties) {
        if (property.type === "RestElement") {
          const restValue = context.realm.types.object();
          for (const key in value) {
            if (!seenProperties.has(key)) {
              const propertyValue = yield* value.getPropertyEvaluator(key);
              yield* restValue.setPropertyEvaluator(
                key,
                propertyValue,
                context.realm.strict,
              );
            }
          }

          return yield* setLVal(
            property.argument,
            restValue,
            context,
            setNamedVariable,
          );
        } else {
          const propertyKey = property.key;
          let keyName: string;
          if (!property.computed && propertyKey.type === "Identifier") {
            keyName = propertyKey.name;
          } else {
            const value = yield* EvaluateNodeCommand(propertyKey, context, {
              rethrow: true,
              forNormalValue: "ObjectPattern.properties[].key",
            });
            keyName = toPropertyKey(value);
          }

          const propertyValue = yield* value.getPropertyEvaluator(keyName);

          if (!property.computed && property.value.type === "Identifier") {
            yield* setNamedVariable(property.value.name, propertyValue);
          } else if (isLVal(property.value)) {
            const completion = yield* setLVal(
              property.value,
              propertyValue,
              context,
              setNamedVariable,
            );

            if (completion.type !== "normal") {
              return completion;
            }
          } else {
            // FIXME: What else can this be?  How do these come up?
            throw new StaticJsEngineError(
              `Unsupported ObjectPattern property target type: ${property.value.type}`,
            );
          }
        }
      }

      return NormalCompletion(null);
    }
    case "AssignmentPattern": {
      if (!value || isStaticJsUndefined(value)) {
        value = yield* EvaluateNodeCommand(lval.right, context, {
          rethrow: true,
          forNormalValue: "AssignmentPattern.right",
        });
      }

      return yield* setLVal(lval.left, value, context, setNamedVariable);
    }
    case "MemberExpression": {
      if (!value) {
        // FIXME: Is this correct???
        // We certainly don't handle this in environmentSetupLVal.
        throw new StaticJsEngineError(
          "Cannot use MemberExpression as LVal without value.",
        );
      }

      const object = yield* EvaluateNodeCommand(lval.object, context, {
        rethrow: true,
        forNormalValue: "MemberExpression.object",
      });

      if (!isStaticJsObject(object)) {
        // FIXME: Use real error.
        return ThrowCompletion(
          context.realm.types.string("Cannot set property on non-object"),
        );
      }
      if (!value) {
        // null values are only used for declarations.
        // Does this ever come up in the syntax?
        throw new StaticJsEngineError("Cannot set property without value");
      }

      let propertyKey: string;
      if (!lval.computed && lval.property.type === "Identifier") {
        propertyKey = lval.property.name;
      } else {
        const property = yield* EvaluateNodeCommand(lval.property, context, {
          rethrow: true,
          forNormalValue: "MemberExpression.property",
        });
        propertyKey = toPropertyKey(property);
      }

      // FIXME: Is this correct?  We set the object directly???
      yield* object.setPropertyEvaluator(
        propertyKey,
        value,
        context.realm.strict,
      );

      return NormalCompletion(null);
    }
  }

  throw new StaticJsEngineError(`Unsupported LVal type: ${lval.type}`);
}

export function* environmentSetupLVal(
  lval: LVal,
  context: EvaluationContext,
  bindVariable: (name: string) => EvaluationGenerator<void>,
): EvaluationGenerator<void> {
  switch (lval.type) {
    case "Identifier":
      yield* bindVariable(lval.name);
      return;
    case "ArrayPattern":
      for (const element of lval.elements) {
        if (element === null) {
          continue;
        }

        if (element.type === "RestElement") {
          yield* environmentSetupLVal(element.argument, context, bindVariable);
          return;
        } else {
          yield* environmentSetupLVal(element, context, bindVariable);
        }
      }
      return;
    case "ObjectPattern":
      for (const property of lval.properties) {
        if (property.type === "RestElement") {
          yield* environmentSetupLVal(property.argument, context, bindVariable);
          return;
        } else if (isLVal(property.value)) {
          yield* environmentSetupLVal(property.value, context, bindVariable);
        } else {
          throw new StaticJsEngineError(
            `Unsupported ObjectPattern property target type: ${property.value.type}`,
          );
        }
      }
      return;
    case "AssignmentPattern":
      yield* environmentSetupLVal(lval.left, context, bindVariable);
      return;
  }

  throw new StaticJsEngineError(`Unsupported LVal type: ${lval.type}`);
}

import {
  ObjectExpression,
  ObjectMethod,
  ObjectProperty,
  SpreadElement,
} from "@babel/types";

import { isStaticJsObject, StaticJsObject } from "../../runtime/index.js";

import { evaluateNodeAssertValue } from "./nodes.js";
import functionNodeEvaluator from "./Function.js";
import { NodeEvaluationContext } from "./node-evaluation-context.js";

// Note: I tested the edge-case of having a computed property key that is an expression mutate the value used in the value,
// and the result is each key is computed before its property, and the next property/value pair is computed after the previous property/value pair.

export default function objectExpressionNodeEvaluator(
  node: ObjectExpression,
  context: NodeEvaluationContext,
) {
  const target = StaticJsObject();

  for (const property of node.properties) {
    switch (property.type) {
      case "ObjectMethod":
        objectExpressionPropertyObjectMethodEvaluator(
          target,
          property,
          context,
        );
        break;
      case "ObjectProperty":
        objectExpressionPropertyObjectPropertyEvaluator(
          target,
          property,
          context,
        );
        break;
      case "SpreadElement":
        objectExpressionPropertySpreadElementEvaluator(
          target,
          property,
          context,
        );
        break;
      default:
        throw new Error("Unsupported property type: " + (property as any).type);
    }
  }

  return target;
}

function objectExpressionPropertyObjectMethodEvaluator(
  target: StaticJsObject,
  property: ObjectMethod,
  context: NodeEvaluationContext,
) {
  const propertyKey = property.key;
  let propertyName: string;
  if (!property.computed && propertyKey.type === "Identifier") {
    // Identifiers evaluate to their values, but we want their name.
    propertyName = propertyKey.name;
  } else {
    const resolved = evaluateNodeAssertValue(propertyKey, context);
    propertyName = StaticJsObject.toPropertyKey(resolved);
  }

  const value = functionNodeEvaluator(propertyName, property, context);
  target.setProperty(propertyName, value);
}

function objectExpressionPropertyObjectPropertyEvaluator(
  target: StaticJsObject,
  property: ObjectProperty,
  context: NodeEvaluationContext,
) {
  const propertyKey = property.key;
  let propertyName: string;
  if (!property.computed && propertyKey.type === "Identifier") {
    propertyName = propertyKey.name;
  } else if (propertyKey.type === "PrivateName") {
    throw new Error("Private fields are not supported");
  } else {
    const resolved = evaluateNodeAssertValue(propertyKey, context);
    propertyName = StaticJsObject.toPropertyKey(resolved);
  }

  const value = evaluateNodeAssertValue(property.value, context);
  target.setProperty(propertyName, value);
}

function objectExpressionPropertySpreadElementEvaluator(
  target: StaticJsObject,
  property: SpreadElement,
  context: NodeEvaluationContext,
) {
  const value = evaluateNodeAssertValue(property.argument, context);
  if (!isStaticJsObject(value)) {
    throw new Error("Cannot spread non-object value");
  }

  for (const key of value.getKeys()) {
    target.setProperty(key, value.getProperty(key));
  }
}

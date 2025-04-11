import { executeEvaluatorCommand } from "./commands/index.js";
import EvaluationGenerator from "./EvaluationGenerator.js";

export function runEvaluatorUntilCompletion<TReturn>(
  generator: EvaluationGenerator<TReturn>,
): TReturn {
  const iterator = evaluateCommands(generator);

  let iteratorResult = iterator.next();
  while (!iteratorResult.done) {
    iteratorResult = iterator.next();
  }

  return iteratorResult.value;
}

export function* evaluateCommands<TReturn>(
  generator: EvaluationGenerator<TReturn>,
): Generator<void, TReturn, void> {
  const stack: EvaluationGenerator<unknown>[] = [generator];
  let lastValueType: "next" | "throw" = "next";
  let lastValue: unknown = undefined;
  while (stack.length > 0) {
    const current = stack.at(-1)!;

    try {
      const { value, done } = current[lastValueType](lastValue);
      yield;

      lastValueType = "next";

      if (done) {
        stack.pop();
        lastValue = value;
        continue;
      }

      const nextGen = executeEvaluatorCommand(value);
      stack.push(nextGen);
    } catch (e: unknown) {
      yield;
      lastValueType = "throw";
      lastValue = e;
      stack.pop();
    }
  }

  if (lastValueType === "throw") {
    throw lastValue;
  }

  return lastValue as TReturn;
}

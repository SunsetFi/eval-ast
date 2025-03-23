import { StaticJsEnvironment, StaticJsRealm } from "../runtime/index.js";

export default interface EvaluationContext {
  env: StaticJsEnvironment;
  realm: StaticJsRealm;
}

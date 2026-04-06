export type InteractiveRange = {
  min: number;
  max: number;
  step: number;
};

export type QuadraticExplorerSpec = {
  type: "quadratic_explorer";
  title?: string;
  params: {
    a: number;
    b: number;
    c: number;
  };
  ranges: {
    a: InteractiveRange;
    b: InteractiveRange;
    c: InteractiveRange;
  };
};

export type TrigFunction = "sin" | "cos" | "tan";

export type TrigExplorerSpec = {
  type: "trig_explorer";
  title?: string;
  function: TrigFunction;
  params: {
    amplitude: number;
    frequency: number;
    phase: number;
    offset: number;
  };
  ranges: {
    amplitude: InteractiveRange;
    frequency: InteractiveRange;
    phase: InteractiveRange;
    offset: InteractiveRange;
  };
};

export type InteractiveSpec =
  | QuadraticExplorerSpec
  | TrigExplorerSpec;

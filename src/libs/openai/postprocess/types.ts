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

export type LinearExplorerSpec = {
  type: "linear_explorer";
  title?: string;
  params: {
    slope: number;
    intercept: number;
  };
  ranges: {
    slope: InteractiveRange;
    intercept: InteractiveRange;
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

export type SingleInteractiveSpec =
  | QuadraticExplorerSpec
  | LinearExplorerSpec
  | TrigExplorerSpec;

export type ComparisonExplorerSeries = {
  id: string;
  label?: string;
  color?: string;
  spec: SingleInteractiveSpec;
};

export type ComparisonExplorerSpec = {
  type: "comparison_explorer";
  title?: string;
  mode: "overlay";
  series: [ComparisonExplorerSeries, ComparisonExplorerSeries];
};

export type InteractiveSpec =
  | SingleInteractiveSpec
  | ComparisonExplorerSpec;

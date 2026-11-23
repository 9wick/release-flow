export type Environment = "prod" | "stg" | "dev";

export type Branches = { readonly production: string; readonly staging: string };

export const environmentOf = (branch: string, branches: Branches): Environment =>
  branch === branches.production ? "prod" : branch === branches.staging ? "stg" : "dev";

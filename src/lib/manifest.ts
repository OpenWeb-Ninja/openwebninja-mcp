import data from "../generated/manifest.js";

export interface OperationDef {
  method: string;
  path: string;
  summary: string;
  description: string;
  pathParams: string[];
  queryParams: string[];
  bodyParams: string[];
  inputSchema: Record<string, any>;
}

export interface ApiDef {
  id: string;
  slug: string;
  basePath: string;
  title: string;
  version: string;
  description: string;
  operations: Record<string, OperationDef>;
}

export interface Manifest {
  generatedAt: string;
  defaultHost: string;
  apiCount: number;
  operationCount: number;
  apis: ApiDef[];
}

export const manifest = data as Manifest;

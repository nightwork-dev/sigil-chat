/**
 * Core types for the computation graph.
 *
 * Branded string types for type safety — a NodeId can't be passed
 * where an EdgeId is expected.
 */

export type NodeId = string & { __brand: "NodeId" }
export type EdgeId = string & { __brand: "EdgeId" }
export type SocketId = string & { __brand: "SocketId" }
export type ReducerId = string & { __brand: "ReducerId" }

export interface Position {
  x: number
  y: number
}

export interface Size {
  width: number
  height: number
}

export interface Bounds {
  x: number
  y: number
  width: number
  height: number
}

export interface Viewport {
  x: number
  y: number
  zoom: number
}

export function worldToScreen(wx: number, wy: number, vp: Viewport): Position {
  return { x: wx * vp.zoom + vp.x, y: wy * vp.zoom + vp.y }
}

export function screenToWorld(sx: number, sy: number, vp: Viewport): Position {
  return { x: (sx - vp.x) / vp.zoom, y: (sy - vp.y) / vp.zoom }
}

let _counter = 0
export function createId(): string {
  return `${Date.now().toString(36)}-${(++_counter).toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

/** Shape types that can be drawn on a canvas */
export type ShapeType =
  | "rect"
  | "ellipse"
  | "triangle"
  | "star"
  | "arrow"
  | "text"
  | "pen"
  | "path"
  | "laser"
  | "group"

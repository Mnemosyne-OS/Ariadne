# Third-party notices

Ariadne draws a badge for each agent it reads. The three do not have the same
provenance, and the difference is worth stating rather than smoothing over.

| Badge | Where the shape comes from |
|---|---|
| **OpenClaw** | The publisher's own file, redistributed under its licence |
| **Antigravity** (and its IDE) | Vectorised from the publisher's own installed icon |
| **Claude Code** | **Drawn here.** An approximation, not an official mark |

## OpenClaw

Path data taken from `dist/control-ui/favicon.svg` in the
[`openclaw`](https://www.npmjs.com/package/openclaw) npm package — body and both
claws, scaled uniformly from its 120-unit viewBox to the 24-unit one this app
uses. A scale, never a redraw.

> MIT License
>
> Copyright (c) 2026 OpenClaw Foundation
>
> Permission is hereby granted, free of charge, to any person obtaining a copy
> of this software and associated documentation files (the "Software"), to deal
> in the Software without restriction, including without limitation the rights
> to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
> copies of the Software, and to permit persons to whom the Software is
> furnished to do so, subject to the following conditions:
>
> The above copyright notice and this permission notice shall be included in all
> copies or substantial portions of the Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
> IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
> FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
> AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
> LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
> OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
> SOFTWARE.

## Antigravity

The arch is Antigravity's own product icon, taken from `icon.png` inside the
`app.asar` of the installed application and vectorised by following the contour
of its alpha channel (27 points after simplification, inset to 92%). It is a
trace of their artwork, not an interpretation of it. Antigravity and Antigravity
IDE are the same product and carry the same mark.

A hand-drawn arch was tried first. Rendered beside the real icon it was visibly
fatter, with stubby legs and the wrong lean, so it was thrown away — which is
the argument for tracing rather than remembering.

## Claude Code

**This one is drawn, and that is a real difference.** No Anthropic asset ships
on the machine this was built on, so there was nothing to trace: the burst is a
rendering of the published Claude mark — twelve tapered rays meeting at the
centre — and it is an approximation, not the trademark itself.

It ships at the project owner's explicit direction, given on 2026-09-06 after
the risk was named. If Anthropic would rather it were not used, removing it is
one line in `claude-code.json` and no code change at all. The same is true the
day an official path becomes available: the connector is data.

## The bar for the next one

`SourceMark.tsx` still defaults to a plain text label, and that default is not
an accident. In order of preference: **the publisher's own file** (OpenClaw),
then **a trace of their own artwork** (Antigravity), and only then **a drawing,
labelled as one** (Claude Code). A shape recalled from memory and presented
without that label would be the thing to avoid — not because it looks worse, but
because nothing on screen would say it is a guess.

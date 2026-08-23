# Fonts

Empty on purpose.

On Apple hardware `-apple-system` already resolves to **SF Pro** — the real
thing, no download, no licence question. That covers Macs, iPads and iPhones,
which is most of how this app will be used.

These files only change what Windows and Android see. Read the licence note in
`docs/DESIGN-SYSTEM.md` before adding them.

If you do add them, the names must match exactly:

```
SF-Pro-Display.woff2
SF-Pro-Text.woff2
```

`src/styles.css` already declares both as variable fonts (`font-weight: 100 900`).
Nothing else needs changing — if the files are absent the browser skips the
`@font-face` rules silently and falls through the stack.

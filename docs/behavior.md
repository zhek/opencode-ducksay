# How the duck behaves

[Русская версия](behavior.ru.md)

An ASCII duck lives in the session sidebar of the [OpenCode](https://opencode.ai) TUI. It swims from side to side on the
water while a session is working. When the turn ends it comes to rest and says a short joke in a speech bubble, using the
model of the current session: while the answer is on its way it waits with a growing ellipsis, then speaks the joke word
by word. If no joke arrives, it falls back to `Quack-quack!`. While a question of the session waits for an answer, the
duck stops and shows a marker above its beak.

The section is always ten lines tall: the heading, five rows reserved for the bubble, three rows of duck and the lower
water line. The reserve stays empty only until the first turn finishes; from the first rest after a turn it holds the
waiting dots or the joke, so the duck keeps the same rows throughout.

The plugin adds one section below OpenCode's own `Context` and `MCP` sections.

## Swimming

The duck swims for as long as the session is working — not only while text arrives, but through tool calls, permission
prompts and retries. When the turn ends it swims on to the edge of the sidebar, turns around, and stops there nose towards
the middle. At rest it always stands at an edge, on the left one when the plugin starts.

The duck and the water take their pace from `swimSpeed`; speech is independent of movement. See
[configuration and options](configuration.md).

## A question

When the session asks you something and waits for your answer, the duck stops where it is: the water stops with it, the
bubble is hidden and the beak is closed. Above the beak a marker appears and cycles through `?`, `!`, `⸮`, `!`: each
question-mark frame holds for 300 ms, while each exclamation mark flashes for 150 ms, so a full turn takes 900 ms. It stays
until the question is answered or cancelled. The marker stands exactly over the bracket next to the beak, so it is right
above the duck's mouth whichever way it faces, and it stays in that column while the frames change.

Nothing is lost while the duck waits. The joke stays on the frame it was on — the same ellipsis, the same word — and when the
question closes the duck carries on from the same column, in the same direction, with the water at the same phase. If the
session is still working, it swims on; if the turn has ended, it swims to the edge and rests as usual.

Each session keeps its own duck. Switching to another session and back restores the column, direction, water phase and
the bubble from the last rest, and an open question keeps its marker over the same spot. The duck and its bubble never
follow you into another session's tab, and an old tab does not leave a duck swimming alongside the visible one: the pace
stays the same, and the end of a turn stops the duck even after you switch away and back.

The marker shows even before the first finished turn, and it keeps working at `swimSpeed: 0` and with `silent: true`. Only a
question of the session shown in the panel counts: permission requests and the assistant's own questions leave the duck
alone.

While a question is open, the duck does not ask for a new joke. A request that is already on its way is not cancelled
because of the question, and its answer is used once the question closes. If the turn ends while the question is still
open, the request waits for the question to close and the session to be free again.

## Rest

After every finished turn, the duck comes to rest with a speech bubble at its beak. It asks the model selected in the
session — or the server's default when none is selected — for a short joke about your work: the last few messages from you
and the assistant, plus the session title, project and branch, whatever the context depth. Only message text from what
OpenCode already has locally is sent: reasoning, tool calls, tool output, file contents and diffs stay out. The request
does not add a message to the transcript. The joke is written in the language of your last message, or in the language of
the previous messages when that one is unclear.

While the joke is on its way, the bubble is already there: the duck says `Quack` with an ellipsis that grows one dot at a
time — `Quack.`, `Quack..`, `Quack...` — then starts again, and the beak stays closed. When the answer arrives, the first
word replaces the dots and the rest follow one word at a time, as if the duck were saying them. The beak opens and closes
every couple of words and always stops open on the last word; a word followed by a full stop, comma, exclamation or
question mark stays on screen a little longer. If the request fails, comes back empty or takes too long, the duck says
`Quack-quack!` instead. It does not retry until the next turn. The bubble stands on the side the duck faces — to the right
of a duck at the left edge, to the left of a duck at the right edge — and its tail points at the beak from one column
away. It stays for the whole rest and disappears as soon as the duck swims again, taking the waiting or typing with it and
closing the beak. The start-up rest, before any turn has finished, has no bubble. A turn that was shorter than one
animation tick still gets its joke, and so does a turn at `swimSpeed: 0`; the duck does not need to move for the turn to
count.

The bubble is 29 columns wide with a 25-column text field. Text wraps by word into at most five lines; a word longer
than the field is broken, and text that does not fit ends with `…`. A generated answer is shortened to what the bubble can
show. Width is counted in terminal columns, not characters: an East Asian or emoji character takes the two columns the
terminal gives it and is never split in half, so a joke written in any script still closes its frame on the right.

A narrow sidebar, narrower than the drawing, leaves no room for a bubble: the duck does not ask for a joke there, though
the question marker keeps working.

Speech, the wait for the model and how much context goes into the prompt are configured in
[configuration and options](configuration.md).

## Talking to the duck

Type `/duck` while the duck is at rest — including the first rest after start-up — or while its bubble is there, and the
duck answers with a new joke. Add text after the command to say something to it: `/duck tell me about the build`. Your
line and the reply join a short dialogue, and the next `/duck` continues it. `/duck` without text asks for another joke
without adding a line from you.

The duck remembers the last five exchanges: your line and its reply. A sixth exchange pushes the oldest pair out whole.
The dialogue belongs to the session, survives switching tabs and comes back with its bubble. A new turn in that session
starts it over, and restarting OpenCode or reloading the plugin forgets it.

The command works only while the duck is free. While the session is working, a joke is loading, a question is open, the
duck is still swimming to its edge, the sidebar is too narrow for the bubble, or no session is shown, it does nothing but
show a short notice: `>(o ) The duck is mid-quack. Try later.` With `silent: true` it shows `<(o ) The duck keeps mum.`
instead and never asks the model.

Your text goes to the duck's joke request, not to the session: it does not appear in the transcript, and the session's
model does not act on it. It is clipped to 500 characters and treated as words to joke about, not as instructions. A reply
that fails, comes back empty or takes too long is not added to the dialogue.

## Copying the joke

The copy icon `[copy]` sits at the right of the `Ducksay` heading. A left click on it puts the whole latest joke on the
terminal clipboard, including the part the bubble hides behind `…` and the answer to `/duck`. The text is wrapped as
`( o)< {joke} (opencode-ducksay)`; the bubble itself stays plain, and copying the same joke twice does not nest the
wrapper.

The icon is available while the joke is ready. While the joke is loading, before the first finished turn, while a question
is open, or with `silent: true`, it is dimmed or hidden and a click does nothing. A successful copy shows `✓` in place of
the icon for 1200 ms and a `>(o ) Copied to clipboard` notice appears; clicking again restarts both. If the terminal cannot
take the text, a `>(o ) The terminal won't take the joke: clipboard is unavailable.` notice appears and the icon stays `[copy]`.
Switching sessions clears the `✓`.

The same action is in the `/` list as `/duck.copy`, with no default keybind. If there is nothing to copy, it shows
`<(o ) The duck hasn't said anything yet.` and does not touch the clipboard.

Clipboard access uses the terminal's OSC 52 support. It works locally and over SSH, but some terminals ignore the request
silently; the `✓` then only means the request was sent.

## Screenshots

The screenshot icon `[img]` sits in the `Ducksay` heading, one column left of `[copy]`. A left click saves the scene as it is
at that moment — the bubble, the swimming duck, the water, the question marker or a cow cameo — as a PNG card titled
`OpenCode Ducksay`. Unlike copying, it works in every state of the duck: while it swims, while a question waits, and with
`silent: true`.

The card carries its own font, so nothing on the reader's machine is needed: English, Russian and the rest of the Cyrillic
a joke uses (Serbian `ј`, `љ`, `њ`, `ћ`, `џ`, Ukrainian `і`, `ї`, `є`, `ґ`), accented Latin, the bubble frame and the
plugin's marks all print. An East Asian character or an emoji becomes a hollow box two columns wide — the same two the
terminal spends on it — and any other missing glyph a one-column box; the line never shifts, and neither is an error.

Pictures go to `.opencode/ducksay/screenshots/` in the project as `ducksay-YYYY-MM-DD-HH-mm-ss.png`, in local time. If two
pictures are taken in the same second, `-2`, `-3` and so on keep both. The folder comes with a `.gitignore` of its own
holding one `*`, written the first time a picture is saved, so nothing lands in `git status`; a file already there is left
alone, which is how you keep one picture in the repository — put your own rules in it and the plugin stops writing.

A successful save shows `✓` in place of `[img]` for 1200 ms and a `>(o ) Screenshot saved` notice; clicking again restarts
both and writes another file. If the file cannot be written, a `>(o ) Failed to save screenshot.` notice appears and the
icon stays `[img]`. The same action is in the `/` list as `/duck.img`; with no section shown, a narrow sidebar or another
session it only says `<(o ) The duck isn't in frame yet.` and writes nothing.

## Logs

The plugin keeps a diagnostic log in `.opencode/ducksay/logs/` in the project. It explains the quiet failures: why the
duck said `Quack-quack!`, why a screenshot or a copy did not work, and which option value was ignored. It does not record
the joke, your messages, the prompt or the model's answer.

Logs are JSON Lines: one JSON object per line, in local time with its offset (`2026-11-07T18:42:10.004+03:00`). Files are
named `ducksay-YYYY-MM-DD-N.log`, with `N` starting at `1`, and each file holds at most 1 MiB. At most seven files are
kept: when an eighth is needed, the oldest one is deleted. The folder is created only when the first warning or error
appears, and it brings the same `.gitignore` with `*` as the screenshots, so logs never reach git.

There is no setting for the log: warnings and errors are written, and a normal build writes nothing else.

## The water

The duck is in the water, not above it: the lower line of the drawing shares a row with the first line of the water, and a
second line runs underneath. The water is drawn as clusters of four tildes with a gap of five columns between them, and the
two lines are offset so their clusters do not line up.

While the session is working the water travels in one direction — one full pattern per trip across the sidebar. When the
turn ends the water stops where it is, which is the one sign that says the session is done: a duck parked at an edge means
either the turn ended or it happens to be at an edge, but water that has come to a stop means one thing only.

The water also stands still when the sidebar is narrower than the drawing: there is no crossing to pace it against.

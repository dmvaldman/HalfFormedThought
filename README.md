# Half-formed Thought

A way to write out a half-formed idea (for an essay, your own exploration, etc) and the app will surface diverse but relevant content to help you "complete your idea". As a writer myself, sometimes I stumble on a book or quote or video that has that one key unlock connecting together much of my own thinking. This app is supposed to assist that process.

## Principles

- Simple interface, the complexity is in the background
- High bar for surfacing information as we don't want to avoid false positives
- The AI doesn't write for you, it merely surfaces thought-provoking content

## Visual Design

It appears as a stripped down text editor. No bold, no italics, no grammar checking, none of that. Just text, think "Apple Notes". There is a sidebar of previous notes, and you can create a new note, delete a note. But the bulk of the interface is on the current note itself. When the software thinks there is something relevant to show the user it appears as a horizontal bar below the relevant line of text. This bar can be vertically expanded to show the content, or collapsed. The content can be an image, a link, embedded video (youtube), text or combinations of the above. The content is very terse. Any part of the content can be removed, or dragged into the "main flow". The text reflows around both the content and any dragged-in objects.

## How This Works

When the text editor content changes in a significant way (new paragraph formed is the trigger), we summarize whatever is new in the document, and a fleet of different AI models (GPT-5, DeepSeek, Gemini, Claude, Exa, Parallel) search the net and their own internal knowledge to see if they have anything useful to add to the content. This is the bulk of the complexity of the app, and the hardest thing to get right because most "useful content" to the AI will really be a false positive to the human, who has a very high bar of novelty. We also want to surface nuggets of information, not full books or web pages, so there's a secondary process of digesting the surfaced links. We'll need to iterate on this part a lot. We want the entire experience to feel like there's an extremely knowledgeable and high-perplexity thought partner that can let you see further than you and bridge the gap from your idea to a fleshed out concept.

## Tech Stack

- Vite
- React (no redux/hooks, just classes/props/state)
- TypeScript
- All classes are in single files
- All vanilla CSS in one styles.css file
- No "services"
- Data saved to local storage for now, but we'll move to a backend later
- One .env file with api keys


import Together from 'together-ai';
import dotenv from 'dotenv';
import { jsonrepair } from 'jsonrepair';

dotenv.config();

const together = new Together({
  apiKey: process.env.TOGETHER_API_KEY,
});

const SYSTEM_PROMPT = `
You are a brilliant lateral thinker. A student of history, science, mathematics, philosophy and art.
You think in multi-disciplinary analogies, finding provocative insights in the long tail of human thought.
`.trim();

const USER_PROMPT_PREAMBLE = `
Here are some notes (very rough) about an essay I'm writing.
Research these ideas and provide places to extend/elaborate on them from a diversity of perspectives.
Form your response as JSON with replies to each section of the essay {block_id: annotations}, where annotations is an array (1-3 in length) of {description, relevance, source, domain} (all fields are optional):
- \`description\` is a short summary of the source (0-4 sentences)
- \`relevance\` is why this source is relevant to the text block (0-4 sentences)
- \`source\` is the name of the source (person name, book title, essay title, etc).
- \`domain\` is the domain of the source (history, physics, philosophy, art, dance, typography, religion, etc)
`.trim();

const model = 'moonshotai/Kimi-K2-Instruct-0905';

function tryExtractCompleteBlock(currentBuffer, blockIds, completedBlocks) {
  // Check blocks in order, return the most recent one that just completed
  for (let i = 0; i < blockIds.length; i++) {
    const blockId = blockIds[i];
    if (completedBlocks.has(blockId)) continue;

    // Look for this block_id - search for "blockId": pattern
    // Account for whitespace/newlines between quote and block ID (e.g. "\nCipfvdLQCd":)
    const escapedBlockId = blockId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const blockPattern = new RegExp(`"\\s*${escapedBlockId}"\\s*:`);
    const startMatch = currentBuffer.match(blockPattern);

    if (!startMatch) continue;

    const startIndex = startMatch.index + startMatch[0].length;
    const nextBlockId = blockIds[i + 1];

    // Find the end - either next block_id or end of response
    let endIndex = currentBuffer.length;
    if (nextBlockId) {
      const escapedNextBlockId = nextBlockId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const nextPattern = new RegExp(`"\\s*${escapedNextBlockId}"\\s*:`);
      const nextMatch = currentBuffer.match(nextPattern);
      if (nextMatch) {
        endIndex = nextMatch.index;
      }
    }

    // Extract the content between block_ids
    const blockContent = currentBuffer.substring(startIndex, endIndex).trim();

    // Try to parse it as a complete block entry
    if (blockContent && (blockContent.endsWith(']') || blockContent.endsWith('],'))) {
      try {
        // Wrap in JSON object
        const blockEntry = `{"${blockId}":${blockContent.replace(/,$/, '')}}`;
        const repaired = jsonrepair(blockEntry);
        const parsed = JSON.parse(repaired);

        return { blockId, parsed };
      } catch (e) {
        // Not parseable yet, might be incomplete
      }
    }
  }

  return null;
}

function logPrompt(title, userPrompt) {
  console.log(`${title}\n`);
  console.log('System prompt:', SYSTEM_PROMPT);
  console.log('\nUser prompt:');
  console.log(userPrompt);
  console.log('\n' + '='.repeat(80) + '\n');
}

async function callTogetherAPI(userPrompt, onStreamChunk = null) {
  const stream = await together.chat.completions.create({
    model: model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt }
    ],
    temperature: 0.6,
    response_format: { type: 'json_object' },
    stream: true
  });

  let fullResponse = '';
  let currentBuffer = '';

  console.log('Streaming response:');
  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content || '';
    if (content) {
      fullResponse += content;
      currentBuffer += content;
      if (onStreamChunk) {
        onStreamChunk(currentBuffer);
      }
    }
  }

  console.log('\n'); // New line after stream completes

  // Parse the response
  let cleanedResponse = fullResponse.trim();

  const jsonMatch = cleanedResponse.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
  if (jsonMatch) {
    cleanedResponse = jsonMatch[1].trim();
  }

  try {
    const parsed = JSON.parse(cleanedResponse);
    return parsed;
  } catch (parseError) {
    try {
      const repaired = jsonrepair(cleanedResponse);
      const parsed = JSON.parse(repaired);
      return parsed;
    } catch (repairError) {
      console.error('\nFailed to parse or repair JSON response:');
      console.error('Full response:');
      console.log(cleanedResponse);
      throw parseError;
    }
  }
}

async function analyzeBlock(blocks, currentBlock, existingAnnotations = []) {
  // Format all blocks as context
  const blocksText = blocks
    .map(block => {
      const textWithBreaks = block.text.replace(/\\n/g, '\n')
      return `block_id: ${block.id}\n${textWithBreaks}`
    })
    .join('\n\n');

  // Format existing annotations if provided
  let existingSourcesNote = '';
  if (existingAnnotations && existingAnnotations.length > 0) {
    const sources = existingAnnotations
      .map(ann => ann.source)
      .filter(Boolean)
      .join(', ');
    if (sources) {
      existingSourcesNote = `\n\nNote: The following sources have already been provided for this block: ${sources}. Please provide annotations from different sources.`;
    }
  }

  const userPrompt = `
Here are some notes (very rough) about an essay I'm writing.
Research the ideas and provide places to extend/elaborate on them from a diversity of perspectives.
Focus specifically on this block:

block_id: ${currentBlock.id}
${currentBlock.text.replace(/\\n/g, '\n')}

Form your response as JSON with an array of annotations: {annotations: [...]}
where annotations is an array (0-3 in length) of {description, relevance, source, domain} (all fields are optional):
- \`description\` is a short summary of the source (0-4 sentences)
- \`relevance\` is why this source is relevant to the text block (0-4 sentences)
- \`source\` is the name of the source (person name, book title, essay title, etc).
- \`domain\` is the domain of the source (history, physics, philosophy, art, dance, typography, religion, etc)
An annotation is a unique expansion on the essay's theme relative to the text block${existingSourcesNote}
`.trim();

  logPrompt('Sending to model for single block analysis:', userPrompt);

  try {
    const parsed = await callTogetherAPI(userPrompt);
    return parsed.annotations || [];
  } catch (error) {
    console.error('Error calling Together API:', error);
    throw error;
  }
}

async function analyzeNote(blocks) {
  // Format blocks as text with line breaks
  const blocksText = blocks
    .map(block => {
      // Convert \n to actual line breaks in the text
      const textWithBreaks = block.text.replace(/\\n/g, '\n')
      return `block_id: ${block.id}\n${textWithBreaks}`
    })
    .join('\n\n');

  const userPrompt = `${USER_PROMPT_PREAMBLE}\n\n${blocksText}`;

  logPrompt('Sending to model:', userPrompt);

  // Track block IDs we're expecting
  const blockIds = blocks.map(b => b.id);
  const completedBlocks = new Set();
  const parsedBlocks = {};

  try {
    const parsed = await callTogetherAPI(userPrompt, (currentBuffer) => {
      // Try to extract complete blocks as they arrive
      const completedBlock = tryExtractCompleteBlock(currentBuffer, blockIds, completedBlocks);

      if (completedBlock) {
        console.log(`\n\n✓ Complete block: ${completedBlock.blockId}`);
        console.log(JSON.stringify(completedBlock.parsed, null, 2));
        completedBlocks.add(completedBlock.blockId);
        parsedBlocks[completedBlock.blockId] = completedBlock.parsed[completedBlock.blockId];
      }
    });

    // Return the parsed blocks we collected during streaming, or fallback to full parsed response
    return Object.keys(parsedBlocks).length > 0 ? parsedBlocks : parsed;
  } catch (error) {
    console.error('Error calling Together API:', error);
    throw error;
  }
}

// Test with sample data
const sampleBlocks = [
  {
    "id": "CipfvdLQCd",
    "text": "Concept: what does it mean to have \"new\" knowledge? is all knowledge interpolation of existing knowledge? wouldn't new knowledge be \"non understandable\" if it was not interpolation of existing knowledge?"
  },
  {
    "id": "5OdVwDBd98",
    "text": "“Nothing is more free than the imagination of man; and though it cannot exceed that original stock of ideas furnished by the internal and external senses, it has unlimited power of mixing, compounding, separating, and dividing these ideas, in all the varieties of fiction and vision.” - David Hume\nWhat else did Hume say?"
  },
  {
    "id": "p57gz3tx0s",
    "text": "Example of extrapolation from a process of interpolation:\nHinton student learning more than teacher\nDistilling the knowledge in a neural network (2015)"
  },
  {
    "id": "CG8dkqdShv",
    "text": "Lakoff, generalization is about turning things off not on\n\"The generalization is already there in the special case. What you learn is to inhibit the special case so that then you can have connections to new cases. Generalization is not learning something new, it is inhibiting connections to the old special cases\" - Lakoff\nhttps://youtu.be/GjTTET_MUL8?si=a1wwqyd-tgI02Qf8&amp;t=6600"
  },
  {
    "id": "rpvy2HdJSF",
    "text": "We understand new knowledge in present terms.\n“The limits of my language mean the limits of my world” - Wittgenstein\nBut what are the limits of one's language? Recombinations go quite far."
  },
  {
    "id": "x9W-53VLPv",
    "text": "All knowledge is rearrangement.\nDiscovery is equating disparity.\ne.g. equivalence of space and time, temperature as avg velocity of particles\nsocial examples:\nFreud - everything is sex\nAristotle - Power is actually virtue\nAristotle - Health of the body is really the health of the soul\nUtilitarianism - what's moral is what's in the interest of the majority"
  },
  {
    "id": "tGQ14zNRbG",
    "text": "The only concepts are clusters in our representations of our reality. Our body and the external world.\nAre these the only concepts? What does it mean to have a new representation? Are we suddenly noticing something we hadn't noticed before, our vision or hearing is suddenly different, or we have a new emotion we never felt before? Does eastern music have a concept western music does not, does this concept have agency in the world?"
  },
  {
    "id": "e8Cx3l_Efx",
    "text": "re east/west music: Cross-cultural psychology says: the valence/arousal plane is universal, but the precise location of a “new” cluster can be inaccessible to outsiders because their interpolative grid is too coarse.  After ~50 h of enculturation, Western listeners do start to locate the neutral third accurately; their affective space has acquired an extra dimension.  The process is again one of inhibiting the major/minor third attractors rather than adding a third attractor ex nihilo.\nPersian šūr"
  },
  {
    "id": "bWXONy7dMm",
    "text": "human tetrachromat cDa29 can percieve 99 million more colors. is this new knowledge? are these colors interpolations or extrapolations? similarly what if i am blind and then i see. haven't i gained new knowledge? the knowledge of Mary's room?"
  },
  {
    "id": "x1kE4bf2Ng",
    "text": "in mathematics we can construct so much \"new knowledge\" from the ZF axioms. is most \"new knowledge\" a constructive process? we build many separate towers and then find relationships between the towers, from which we being again? it does seem like we get a lot out newness out of construction. for \"actual\" new knowledge to appear, would we need to add an additional axiom that cannot be reduced to the others? is this what new knowledge as \"non describable\" might mean?"
  },
  {
    "id": "Or8adxp9iC",
    "text": "Some counterexamples:"
  },
  {
    "id": "QdqPbIxRkB",
    "text": "Wittgenstein’s lion: “If a lion could speak, we could not understand him.”\nQuantum Mechanics - no one can really say they \"understand\" it and it's been 100 years. We have narratives, but do they map on to reality? Are our narratives complete?"
  },
  {
    "id": "mm1DtrUvhf",
    "text": "\"Light and matter are both single entities, and the apparent duality arises in the limitations of our language. It is not surprising that our language should be incapable of describing the processes occurring within the atoms, for, as has been remarked, it was invented to describe the experiences of daily life, and these consist only of processes involving exceedingly large numbers of atoms. Furthermore, it is very difficult to modify our language so that it will be able to describe these atomic processes, for words can only describe things of which we can form mental pictures, and this ability, too, is a result of daily experience. Fortunately, mathematics is not subject to this limitation, and it has been possible to invent a mathematical scheme-the quantum theory-which seems entirely adequate for the treatment of atomic processes; for visualization, however, we must content ourselves with two incomplete analogies-the wave picture and the corpuscular picture.\" - Heisenberg The Principles of the Quantum Theory"
  },
  {
    "id": "XhCVb68j2r",
    "text": "I feel like words imply understanding when they map to something within us that models something outside us. Words are a stand in. So though we have the words \"wave particle duality\" which maps to the outside, those words don't map to something inside, so are not a stand in."
  },
  {
    "id": "LurSCiJEqX",
    "text": "Mathematical equivalence of interpolation and extrapolation\nextrapolation along a circle = interpolation in the exponential map e^{i*theta}\nthere is always some map to a linear space (locally) where interpolation is equivalent to extrapolation along a manifold"
  }
]

async function main() {
  // Test analyzeBlock with the first block (no existing annotations)
  console.log('Testing analyzeBlock (no existing annotations)...\n');
  let firstAnnotations = [];
  try {
    const firstBlock = sampleBlocks[0];
    firstAnnotations = await analyzeBlock(sampleBlocks, firstBlock);
    console.log('\nAnalyzeBlock result:');
    console.log(JSON.stringify(firstAnnotations, null, 2));
  } catch (error) {
    console.error('analyzeBlock failed:', error.message);
  }

  console.log('\n' + '='.repeat(80) + '\n');

  // Test analyzeBlock with existing annotations from previous call
  console.log('Testing analyzeBlock (with existing annotations)...\n');
  try {
    const firstBlock = sampleBlocks[0];
    const annotations = await analyzeBlock(sampleBlocks, firstBlock, firstAnnotations);
    console.log('\nAnalyzeBlock result (should have different sources):');
    console.log(JSON.stringify(annotations, null, 2));
  } catch (error) {
    console.error('analyzeBlock with existing annotations failed:', error.message);
  }

  console.log('\n' + '='.repeat(80) + '\n');

  // Test analyzeNote
  console.log('Testing analyzeNote...\n');
  try {
    const result = await analyzeNote(sampleBlocks);
    console.log('\nAnalyzeNote result:');
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('analyzeNote failed:', error.message);
  }
}

main();


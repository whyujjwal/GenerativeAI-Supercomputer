import { fetchJson } from '../util/http.js';

function markdownToBlocks(contentMarkdown = '') {
  const chunks = String(contentMarkdown)
    .split(/\n{2,}/)
    .map((chunk) => chunk.trim())
    .filter(Boolean);

  if (chunks.length === 0) {
    return [
      {
        object: 'block',
        type: 'paragraph',
        paragraph: {
          rich_text: [{ type: 'text', text: { content: '' } }],
        },
      },
    ];
  }

  return chunks.map((chunk) => ({
    object: 'block',
    type: 'paragraph',
    paragraph: {
      rich_text: [{ type: 'text', text: { content: chunk.slice(0, 2000) } }],
    },
  }));
}

export async function createPage(tokenData, { parentId, title, contentMarkdown }) {
  if (!parentId || !title) {
    throw new Error('parentId and title are required');
  }

  const data = await fetchJson('https://api.notion.com/v1/pages', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${tokenData.access_token}`,
      'Content-Type': 'application/json',
      'Notion-Version': '2022-06-28',
    },
    body: JSON.stringify({
      parent: { page_id: parentId },
      properties: {
        title: {
          title: [{ type: 'text', text: { content: title } }],
        },
      },
      children: markdownToBlocks(contentMarkdown),
    }),
  });

  return {
    id: data.id,
    url: data.url,
    created_time: data.created_time,
  };
}

export const actions = {
  createPage,
};

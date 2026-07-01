// ═══════════════════════════════════════════════════════════════════
// NewsPost Auto — Instagram publishing
//
// Your PAGE_ACCESS_TOKEN starts with "IGAA…", which is an **Instagram
// Login API** token → it talks to graph.instagram.com (NOT the Facebook
// Graph host). Two-step flow: create media container → wait → publish.
//
// Override host/version via env if you ever switch to a Facebook-Page
// token (EAAB…): IG_GRAPH_BASE=https://graph.facebook.com
// ═══════════════════════════════════════════════════════════════════
import axios from 'axios';

const BASE = process.env.IG_GRAPH_BASE || 'https://graph.instagram.com';
const VER = process.env.IG_GRAPH_VERSION || 'v21.0';
// "me" is the safest target for an Instagram-Login token, but an explicit
// id (the one returned by /me) works too.
const ACCOUNT = process.env.INSTAGRAM_ACCOUNT_ID || 'me';

const root = `${BASE}/${VER}`;
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

export async function postToInstagram(imageUrl, caption, hashtags) {
  const token = process.env.PAGE_ACCESS_TOKEN;
  if (!token) throw new Error('PAGE_ACCESS_TOKEN not set in .env');
  if (!imageUrl) throw new Error('No image URL to post');

  const fullCaption = [caption, hashtags].filter(Boolean).join('\n\n');

  // Step 1 — create the media container.
  let creationId;
  try {
    const createRes = await axios.post(`${root}/${ACCOUNT}/media`, null, {
      params: { image_url: imageUrl, caption: fullCaption, access_token: token },
      timeout: 30000,
    });
    creationId = createRes.data?.id;
  } catch (err) {
    throw new Error(`IG container create failed: ${graphErr(err)}`);
  }
  if (!creationId) throw new Error('IG container create returned no id');

  // Instagram needs a moment to fetch/validate the image.
  await sleep(3000);

  // Step 2 — publish the container.
  try {
    const pubRes = await axios.post(`${root}/${ACCOUNT}/media_publish`, null, {
      params: { creation_id: creationId, access_token: token },
      timeout: 30000,
    });
    const postId = pubRes.data?.id;
    if (!postId) throw new Error('publish returned no id');
    return postId;
  } catch (err) {
    throw new Error(`IG publish failed: ${graphErr(err)}`);
  }
}

// Post the same image to the account's Instagram Story (image only).
export async function postStoryToInstagram(imageUrl) {
  const token = process.env.PAGE_ACCESS_TOKEN;
  if (!token) throw new Error('PAGE_ACCESS_TOKEN not set in .env');
  if (!imageUrl) throw new Error('No image URL for story');

  // Step 1 — create a STORIES media container.
  let creationId;
  try {
    const createRes = await axios.post(`${root}/${ACCOUNT}/media`, null, {
      params: { image_url: imageUrl, media_type: 'STORIES', access_token: token },
      timeout: 30000,
    });
    creationId = createRes.data?.id;
  } catch (err) {
    throw new Error(`IG story container failed: ${graphErr(err)}`);
  }
  if (!creationId) throw new Error('IG story container returned no id');

  await sleep(3000);

  // Step 2 — publish the story.
  try {
    const pubRes = await axios.post(`${root}/${ACCOUNT}/media_publish`, null, {
      params: { creation_id: creationId, access_token: token },
      timeout: 30000,
    });
    const storyId = pubRes.data?.id;
    if (!storyId) throw new Error('story publish returned no id');
    return storyId;
  } catch (err) {
    throw new Error(`IG story publish failed: ${graphErr(err)}`);
  }
}

export async function testConnection() {
  const token = process.env.PAGE_ACCESS_TOKEN;
  if (!token) return { ok: false, error: 'PAGE_ACCESS_TOKEN not set' };

  try {
    const res = await axios.get(`${root}/${ACCOUNT}`, {
      params: { fields: 'id,username,account_type', access_token: token },
      timeout: 15000,
    });
    return { ok: true, account: res.data };
  } catch (err) {
    return { ok: false, error: graphErr(err) };
  }
}

function graphErr(err) {
  return (
    err?.response?.data?.error?.message ||
    err?.response?.data?.error?.error_user_msg ||
    err?.message ||
    'Unknown Graph API error'
  );
}

export default { postToInstagram, postStoryToInstagram, testConnection };

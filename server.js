import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = Number(process.env.PORT || 3000);
const VK_API_VERSION = process.env.VK_API_VERSION || '5.199';
const VK_ACCESS_TOKEN = process.env.VK_ACCESS_TOKEN || '';
const VK_GROUP_ID = Number(String(process.env.VK_GROUP_ID || '').replace(/^-/, ''));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { files: 5, fileSize: 12 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, file.mimetype.startsWith('image/')),
});

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));

function ensureConfigured() {
  if (!VK_ACCESS_TOKEN) throw new Error('На сервере не задан VK_ACCESS_TOKEN');
  if (!Number.isSafeInteger(VK_GROUP_ID) || VK_GROUP_ID <= 0) throw new Error('На сервере не задан корректный VK_GROUP_ID');
}

function ownerId() {
  ensureConfigured();
  return -VK_GROUP_ID;
}

function apiBody(params = {}) {
  const body = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    body.set(key, Array.isArray(value) ? value.join(',') : String(value));
  });
  body.set('access_token', VK_ACCESS_TOKEN);
  body.set('v', VK_API_VERSION);
  return body;
}

async function vkCall(method, params = {}) {
  ensureConfigured();
  const response = await fetch(`https://api.vk.com/method/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: apiBody(params),
  });
  const data = await response.json();
  if (data.error) {
    const error = new Error(data.error.error_msg || `VK API error ${data.error.error_code}`);
    error.vk = data.error;
    error.vkMethod = method;
    throw error;
  }
  return data.response;
}

async function uploadMarketPhoto(file) {
  const uploadServer = await vkCall('market.getProductPhotoUploadServer', {
    group_id: VK_GROUP_ID,
  });

  if (!uploadServer?.upload_url) throw new Error('VK не вернул адрес сервера для загрузки фотографии');

  const form = new FormData();
  form.append('file', new Blob([file.buffer], { type: file.mimetype }), file.originalname || 'photo.jpg');

  const uploadResponse = await fetch(uploadServer.upload_url, { method: 'POST', body: form });
  const uploaded = await uploadResponse.json();
  if (!uploadResponse.ok) throw new Error('VK не принял фотографию');

  const saved = await vkCall('market.saveProductPhoto', {
    upload_response: JSON.stringify(uploaded),
  });

  const photoId = Number(saved?.photo_id || saved?.photo?.id);
  if (!Number.isSafeInteger(photoId) || photoId <= 0) throw new Error('VK не вернул ID фотографии');
  return photoId;
}

function flattenCategories(items, parent = '', result = []) {
  for (const item of Array.isArray(items) ? items : []) {
    const title = item.name || item.title || '';
    const label = parent && title ? `${parent} → ${title}` : (title || parent);
    const children = item.children || item.items || item.categories;
    if (Array.isArray(children) && children.length) {
      flattenCategories(children, label, result);
    } else if (item.id && title) {
      result.push({ id: Number(item.id), name: label });
    }
  }
  return result;
}

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    configured: Boolean(VK_ACCESS_TOKEN && Number.isSafeInteger(VK_GROUP_ID) && VK_GROUP_ID > 0),
    groupId: Number.isSafeInteger(VK_GROUP_ID) && VK_GROUP_ID > 0 ? VK_GROUP_ID : null,
    apiVersion: VK_API_VERSION,
  });
});

app.get('/api/categories', async (_req, res, next) => {
  try {
    const response = await vkCall('market.getCategories', { group_id: VK_GROUP_ID });
    const raw = response?.items || [];
    const flat = flattenCategories(raw);
    res.json({ items: flat.length ? flat : raw });
  } catch (error) {
    next(error);
  }
});

app.get('/api/albums', async (_req, res, next) => {
  try {
    const response = await vkCall('market.getAlbums', { owner_id: ownerId(), count: 100 });
    res.json({
      items: (response?.items || []).map(item => ({
        id: item.id,
        title: item.title || item.name || `Подборка ${item.id}`,
      })),
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/products', upload.array('photos', 5), async (req, res, next) => {
  try {
    const product = JSON.parse(req.body.product || '{}');
    const name = String(product.title || '').trim();
    const description = String(product.description || '').trim();
    const price = Number(product.price);
    const categoryId = Number(product.vkCategory);
    const quantity = product.quantity === '' || product.quantity == null ? undefined : Number(product.quantity);

    if (!name) throw new Error('Укажите название товара');
    if (!description) throw new Error('Укажите описание товара');
    if (!Number.isFinite(price) || price <= 0) throw new Error('Укажите корректную цену');
    if (!Number.isSafeInteger(categoryId) || categoryId <= 0) throw new Error('Выберите категорию VK');
    if (!req.files?.length) throw new Error('Добавьте хотя бы одну фотографию');

    const photoIds = [];
    for (const file of req.files) {
      photoIds.push(await uploadMarketPhoto(file));
    }

    const [mainPhotoId, ...additionalPhotoIds] = photoIds;
    const created = await vkCall('market.add', {
      owner_id: ownerId(),
      name,
      description,
      category_id: categoryId,
      price,
      deleted: product.active === false ? 1 : 0,
      main_photo_id: mainPhotoId,
      photo_ids: additionalPhotoIds,
      sku: String(product.sku || '').trim() || undefined,
      stock_amount: Number.isSafeInteger(quantity) && quantity >= 0 ? quantity : undefined,
    });

    const itemId = created?.market_item_id;
    if (!itemId) throw new Error('VK не вернул ID созданного товара');

    const albumId = Number(product.album);
    if (Number.isSafeInteger(albumId) && albumId > 0) {
      await vkCall('market.addToAlbum', {
        owner_id: ownerId(),
        item_ids: [itemId],
        album_ids: [albumId],
      });
    }

    res.status(201).json({
      ok: true,
      itemId,
      url: `https://vk.com/market${ownerId()}?w=product${ownerId()}_${itemId}`,
    });
  } catch (error) {
    next(error);
  }
});

app.use((error, _req, res, _next) => {
  console.error(error);

  if (error.vk?.error_code === 27) {
    return res.status(400).json({
      error: 'В VK_ACCESS_TOKEN сейчас используется токен сообщества. Для работы с товарами VK нужен пользовательский access token администратора сообщества.',
      vkErrorCode: 27,
      vkMethod: error.vkMethod,
    });
  }

  return res.status(error instanceof multer.MulterError ? 400 : 500).json({
    error: error.message || 'Ошибка сервера',
    vkErrorCode: error.vk?.error_code,
    vkMethod: error.vkMethod,
  });
});

app.listen(PORT, () => {
  console.log(`VK Market app: http://localhost:${PORT}`);
});

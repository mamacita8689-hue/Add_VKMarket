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
  if (!Number.isSafeInteger(VK_GROUP_ID) || VK_GROUP_ID <= 0) {
    const error = new Error('На сервере не задан корректный VK_GROUP_ID');
    error.status = 500;
    throw error;
  }
}

function ownerId() {
  ensureConfigured();
  return -VK_GROUP_ID;
}

function getUserToken(req) {
  const header = String(req.headers.authorization || '');
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match?.[1]) {
    const error = new Error('Нужно открыть приложение через VK и разрешить доступ к товарам');
    error.status = 401;
    throw error;
  }
  return match[1];
}

function apiBody(accessToken, params = {}) {
  const body = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    body.set(key, Array.isArray(value) ? value.join(',') : String(value));
  });
  body.set('access_token', accessToken);
  body.set('v', VK_API_VERSION);
  return body;
}

async function vkCall(method, params, accessToken) {
  ensureConfigured();
  if (!accessToken) throw new Error('Не получен пользовательский токен VK');

  const response = await fetch(`https://api.vk.com/method/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: apiBody(accessToken, params),
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

async function uploadMarketPhoto(file, accessToken) {
  const uploadServer = await vkCall('market.getProductPhotoUploadServer', {
    group_id: VK_GROUP_ID,
  }, accessToken);

  if (!uploadServer?.upload_url) throw new Error('VK не вернул адрес сервера для загрузки фотографии');

  const form = new FormData();
  form.append('file', new Blob([file.buffer], { type: file.mimetype }), file.originalname || 'photo.jpg');

  const uploadResponse = await fetch(uploadServer.upload_url, { method: 'POST', body: form });
  const uploaded = await uploadResponse.json();
  if (!uploadResponse.ok) throw new Error('VK не принял фотографию');

  const saved = await vkCall('market.saveProductPhoto', {
    upload_response: JSON.stringify(uploaded),
  }, accessToken);

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
    configured: Number.isSafeInteger(VK_GROUP_ID) && VK_GROUP_ID > 0,
    groupId: Number.isSafeInteger(VK_GROUP_ID) && VK_GROUP_ID > 0 ? VK_GROUP_ID : null,
    apiVersion: VK_API_VERSION,
    authMode: 'vk-mini-app-user-token',
  });
});

app.get('/api/categories', async (req, res, next) => {
  try {
    const token = getUserToken(req);
    const response = await vkCall('market.getCategories', { group_id: VK_GROUP_ID }, token);
    const raw = response?.items || [];
    const flat = flattenCategories(raw);
    res.json({ items: flat.length ? flat : raw });
  } catch (error) {
    next(error);
  }
});

app.get('/api/albums', async (req, res, next) => {
  try {
    const token = getUserToken(req);
    const response = await vkCall('market.getAlbums', { owner_id: ownerId(), count: 100 }, token);
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
    const token = getUserToken(req);
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
    for (const file of req.files) photoIds.push(await uploadMarketPhoto(file, token));

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
    }, token);

    const itemId = created?.market_item_id;
    if (!itemId) throw new Error('VK не вернул ID созданного товара');

    const albumId = Number(product.album);
    if (Number.isSafeInteger(albumId) && albumId > 0) {
      await vkCall('market.addToAlbum', {
        owner_id: ownerId(),
        item_ids: [itemId],
        album_ids: [albumId],
      }, token);
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

  let message = error.message || 'Ошибка сервера';
  let status = error.status || (error instanceof multer.MulterError ? 400 : 500);

  if (error.vk?.error_code === 5) {
    status = 401;
    message = 'Авторизация VK истекла. Перезапустите приложение и разрешите доступ ещё раз.';
  } else if (error.vk?.error_code === 7 || error.vk?.error_code === 15) {
    status = 403;
    message = 'VK не разрешил операцию. Убедитесь, что вы администратор сообщества и дали приложению доступ к товарам.';
  } else if (error.vk?.error_code === 27) {
    status = 400;
    message = 'Получен неподходящий тип токена VK. Откройте форму как Mini App внутри VK.';
  }

  res.status(status).json({
    error: message,
    vkErrorCode: error.vk?.error_code,
    vkMethod: error.vkMethod,
  });
});

app.listen(PORT, () => {
  console.log(`VK Market app: http://localhost:${PORT}`);
});

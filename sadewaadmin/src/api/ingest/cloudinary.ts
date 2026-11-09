import { v2 as cloudinary } from 'cloudinary';
cloudinary.config({cloud_name:process.env.CLOUDINARY_CLOUD_NAME,api_key:process.env.CLOUDINARY_API_KEY,api_secret:process.env.CLOUDINARY_API_SECRET});
export async function uploadDraftPhoto(dataUrl:string, scope:string, draftId:string, photoKey:string) {
  const publicId = `foto-${photoKey.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 120)}`;
  const folder = `sadewa/draft/${scope}/${draftId}`;
  try {
    const existing = await cloudinary.api.resource(`${folder}/${publicId}`, { resource_type: 'image' });
    return { publicId: existing.public_id, url: existing.secure_url };
  } catch (error) {
    if ((error as { http_code?: number }).http_code !== 404) throw error;
  }
  const r = await cloudinary.uploader.upload(dataUrl, {
    folder,
    public_id: publicId,
    resource_type: 'image',
    overwrite: false,
    tags: ['sadewa', 'draft'],
    context: { draftId, photoKey, status: 'uploaded' },
  });
  return { publicId: r.public_id, url: r.secure_url };
}
export async function deleteDraftPhoto(publicId:string) { try { await cloudinary.uploader.destroy(publicId); } catch {} }

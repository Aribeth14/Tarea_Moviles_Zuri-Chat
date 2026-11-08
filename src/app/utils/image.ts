// Reduce la imagen a un máximo de 512 px y la convierte en JPG
export async function resizeImage(file: File, max = 512): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

  return new Promise((resolve, reject) =>
    canvas.toBlob(
      b => (b ? resolve(b) : reject(new Error('No se pudo procesar la imagen'))),
      'image/jpeg',
      0.85
    )
  );
}

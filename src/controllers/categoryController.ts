import { Request, Response, NextFunction } from 'express';
import { Category } from '../models';
import { cacheService, CacheService } from '../services/cache/cacheService';
import { ApiResponse, CategoryDTO, NotFoundError } from '../types';

const toCategoryDTO = (category: InstanceType<typeof Category>): CategoryDTO => ({
  id: category._id.toString(),
  name: category.name,
  slug: category.slug,
  description: category.description,
  icon: category.icon,
  color: category.color,
  articleCount: category.articleCount,
});

export const getCategories = async (
  req: Request,
  res: Response<ApiResponse<CategoryDTO[]>>,
  next: NextFunction
): Promise<void> => {
  try {
    // Check cache
    const cacheKey = CacheService.keys.categories();
    const cached = await cacheService.get<CategoryDTO[]>(cacheKey);
    if (cached) {
      res.json({ success: true, data: cached });
      return;
    }

    const categories = await Category.find({ isActive: true })
      .sort({ sortOrder: 1, name: 1 });

    const data = categories.map(toCategoryDTO);
    await cacheService.set(cacheKey, data, 3600); // 1 hour cache

    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

export const getCategoryBySlug = async (
  req: Request,
  res: Response<ApiResponse<CategoryDTO>>,
  next: NextFunction
): Promise<void> => {
  try {
    const { slug } = req.params;

    const category = await Category.findOne({ slug, isActive: true });
    if (!category) {
      throw new NotFoundError('Category');
    }

    res.json({ success: true, data: toCategoryDTO(category) });
  } catch (error) {
    next(error);
  }
};

export default {
  getCategories,
  getCategoryBySlug,
};

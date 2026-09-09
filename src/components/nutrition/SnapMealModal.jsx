import React from 'react';
import { MealLogModal } from './MealLogModal';

export const SnapMealModal = (props) => {
  return <MealLogModal initialTab="upload_image" {...props} />;
};

export default SnapMealModal;

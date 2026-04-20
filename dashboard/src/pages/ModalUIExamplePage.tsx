import React, { useState } from 'react';
import { Modal, ModalFooter, ModalBody } from '../components/ui/Modal';
import { Button } from '../components/ui/Button';
import { RadioGroup, Radio } from '../components/ui/RadioGroup';
import { FormField, Input, Select, TextArea } from '../components/ui/Form';

/**
 * Example page demonstrating improved modal UI standards
 * Features:
 * - Professional Modal component
 * - Radio buttons for selection
 * - Standardized form components
 * - Consistent spacing and typography
 */
const ModalUIExamplePage = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    type: 'academic',
    status: 'active',
    description: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleOpenModal = () => setIsOpen(true);
  const handleCloseModal = () => {
    setIsOpen(false);
    setErrors({});
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    // Clear error for this field when user starts typing
    if (errors[field]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    if (!formData.name.trim()) {
      newErrors.name = 'Name is required';
    }
    if (!formData.type) {
      newErrors.type = 'Type is required';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;

    console.log('Form submitted:', formData);
    // Handle form submission
    handleCloseModal();
  };

  return (
    <div className="p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-4">
          Modal UI Standards Example
        </h1>

        <div className="space-y-6">
          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-4">
              Professional Modal with Radio Buttons
            </h2>
            <p className="text-gray-600 mb-6">
              This example shows how to use the new standardized modal component
              with radio buttons and form fields that follow UI best practices.
            </p>

            <Button variant="primary" onClick={handleOpenModal}>
              Open Modal Example
            </Button>
          </section>

          {/* Features List */}
          <section className="bg-blue-50 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-blue-900 mb-4">Features</h3>
            <ul className="space-y-2 text-blue-800">
              <li>✅ Responsive modal with backdrop</li>
              <li>✅ Radio button groups with descriptions</li>
              <li>✅ Standardized form fields with error states</li>
              <li>✅ Consistent button styling (primary, secondary, danger)</li>
              <li>✅ Helper text and error messages</li>
              <li>✅ Form validation</li>
              <li>✅ Smooth animations and transitions</li>
            </ul>
          </section>
        </div>

        {/* Modal */}
        <Modal
          isOpen={isOpen}
          title="Create New Entry"
          description="Fill in the details below to create a new entry"
          onClose={handleCloseModal}
          size="lg"
        >
          <ModalBody className="space-y-6">
            <FormField
              label="Name"
              required
              error={errors.name}
            >
              <Input
                type="text"
                placeholder="Enter name"
                value={formData.name}
                onChange={(e) => handleInputChange('name', e.target.value)}
                error={!!errors.name}
              />
            </FormField>

            <FormField
              label="Type"
              required
              error={errors.type}
              helperText="Select the type of entry"
            >
              <RadioGroup
                name="type"
                value={formData.type}
                onChange={(value) => handleInputChange('type', value)}
                options={[
                  {
                    value: 'academic',
                    label: 'Academic',
                    description: 'For academic institutions',
                  },
                  {
                    value: 'vocational',
                    label: 'Vocational',
                    description: 'For vocational training centers',
                  },
                  {
                    value: 'professional',
                    label: 'Professional',
                    description: 'For professional development',
                  },
                ]}
              />
            </FormField>

            <FormField label="Status" helperText="Choose the status">
              <div className="space-y-3">
                <Radio
                  name="status"
                  label="Active"
                  value="active"
                  checked={formData.status === 'active'}
                  onChange={() => handleInputChange('status', 'active')}
                  description="Entry is currently active"
                />
                <Radio
                  name="status"
                  label="Inactive"
                  value="inactive"
                  checked={formData.status === 'inactive'}
                  onChange={() => handleInputChange('status', 'inactive')}
                  description="Entry is currently inactive"
                />
              </div>
            </FormField>

            <FormField
              label="Description"
              helperText="Optional description"
            >
              <TextArea
                placeholder="Enter description (optional)"
                value={formData.description}
                onChange={(e) => handleInputChange('description', e.target.value)}
                rows={4}
              />
            </FormField>
          </ModalBody>

          <ModalFooter>
            <Button
              variant="secondary"
              onClick={handleCloseModal}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleSubmit}
            >
              Create Entry
            </Button>
          </ModalFooter>
        </Modal>
      </div>
    </div>
  );
};

export default ModalUIExamplePage;

import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { IApiResponse } from '@shared/types';
import { getCustomerFromRequest } from '../utils/ownership';
import * as beneficiaryService from '../services/beneficiaryService';
import * as auditService from '../services/auditService';

export const listBeneficiaries = async (req: AuthRequest, res: Response): Promise<void> => {
  const customer = await getCustomerFromRequest(req);
  const beneficiaries = await beneficiaryService.getBeneficiaries(customer._id.toString());

  const response: IApiResponse = { success: true, data: { beneficiaries } };
  res.json(response);
};

export const addBeneficiary = async (req: AuthRequest, res: Response): Promise<void> => {
  const customer = await getCustomerFromRequest(req);
  const beneficiary = await beneficiaryService.addBeneficiary(
    customer._id.toString(),
    req.user!._id.toString(),
    req.body
  );

  await auditService.recordAudit(req, {
    action: 'BENEFICIARY_ADD',
    entity: 'beneficiary',
    entityId: beneficiary.id,
    message: `Added payee ${beneficiary.name}`,
    metadata: { bankName: beneficiary.bankName, ifsc: beneficiary.ifsc },
  });

  const response: IApiResponse = {
    success: true,
    message: 'Beneficiary added',
    data: { beneficiary },
  };
  res.status(201).json(response);
};

export const getBeneficiary = async (req: AuthRequest, res: Response): Promise<void> => {
  const customer = await getCustomerFromRequest(req);
  const beneficiary = await beneficiaryService.getBeneficiaryById(
    req.params.beneficiaryId,
    customer._id.toString()
  );

  const response: IApiResponse = { success: true, data: { beneficiary } };
  res.json(response);
};

export const updateBeneficiary = async (req: AuthRequest, res: Response): Promise<void> => {
  const customer = await getCustomerFromRequest(req);
  const beneficiary = await beneficiaryService.updateBeneficiary(
    req.params.beneficiaryId,
    customer._id.toString(),
    req.body || {}
  );

  await auditService.recordAudit(req, {
    action: 'BENEFICIARY_UPDATE',
    entity: 'beneficiary',
    entityId: beneficiary.id,
    metadata: { fields: Object.keys(req.body || {}) },
  });

  const response: IApiResponse = {
    success: true,
    message: 'Beneficiary updated',
    data: { beneficiary },
  };
  res.json(response);
};

export const removeBeneficiary = async (req: AuthRequest, res: Response): Promise<void> => {
  const customer = await getCustomerFromRequest(req);
  const result = await beneficiaryService.deleteBeneficiary(
    req.params.beneficiaryId,
    customer._id.toString()
  );

  await auditService.recordAudit(req, {
    action: 'BENEFICIARY_REMOVE',
    entity: 'beneficiary',
    entityId: result.id,
  });

  const response: IApiResponse = { success: true, message: 'Beneficiary removed' };
  res.json(response);
};

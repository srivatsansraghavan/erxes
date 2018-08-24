import { Model, model } from "mongoose";
import {
  ActivityLogs,
  Companies,
  Conversations,
  EngageMessages,
  Fields,
  InternalNotes
} from "./";
import { CUSTOMER_BASIC_INFOS } from "./definitions/constants";
import {
  customerSchema,
  ICustomerDocument,
  IFacebookData,
  ILink,
  ILocation,
  IMessengerData,
  ITwitterData,
  IVisitorContact
} from "./definitions/customers";
import { IUserDocument } from "./definitions/users";
import { bulkInsert } from "./utils";

interface ICustomerFieldsInput {
  twitterData?: ITwitterData;
  facebookData?: IFacebookData;
  primaryEmail?: string;
  primaryPhone?: string;
}

interface ICreateCustomerInput {
  firstName?: string;
  lastName?: string;
  primaryEmail?: string;
  emails?: string[];

  primaryPhone?: string;
  phones?: string[];

  ownerId?: string;
  position?: string;
  department?: string;
  leadStatus?: string;
  lifecycleState?: string;
  hasAuthority?: string;
  description?: string;
  doNotDisturb?: string;
  links?: ILink;
  isUser?: boolean;
  integrationId?: string;
  tagIds?: string[];
  companyIds?: string[];
  customFieldsData?: any;
  messengerData?: IMessengerData;
  twitterData?: ITwitterData;
  facebookData?: IFacebookData;
  location?: ILocation;
  visitorContactInfo?: IVisitorContact;
  urlVisits?: any;
}

interface ICustomerModel extends Model<ICustomerDocument> {
  checkDuplication(
    customerFields: ICustomerFieldsInput,
    idsToExclude?: string[] | string
  ): never;

  createCustomer(
    doc: ICreateCustomerInput,
    user?: IUserDocument
  ): Promise<ICustomerDocument>;

  updateCustomer(
    _id: string,
    doc: ICreateCustomerInput
  ): Promise<ICustomerDocument>;

  markCustomerAsActive(customerId: string): ICustomerDocument;
  markCustomerAsActive(_id: string): ICustomerDocument;

  addCompany({
    _id,
    name,
    website
  }: {
    _id: string;
    name: string;
    website: string;
  }): ICustomerDocument;

  updateCompanies(_id: string, companyIds: string[]): ICustomerDocument;
  removeCustomer(customerId: string): void;

  mergeCustomers(
    customerIds: string[],
    customerFields: ICreateCustomerInput
  ): ICustomerDocument;

  bulkInsert<T, I>(params: {
    fieldNames: string[];
    fieldValues: string[];
    user: IUserDocument;
    basicInfos: any;
    contentType: string;
    create: (doc: I) => Promise<T>;
  }): Promise<string[]>;
}

class Customer {
  /**
   * Checking if customer has duplicated unique properties
   */
  public static async checkDuplication(
    customerFields: ICustomerFieldsInput,
    idsToExclude?: string[] | string
  ) {
    const query: { [key: string]: any } = {};
    let previousEntry = null;

    // Adding exclude operator to the query
    if (idsToExclude) {
      query._id =
        idsToExclude instanceof Array
          ? { $nin: idsToExclude }
          : { $ne: idsToExclude };
    }

    // Checking if customer has twitter data
    if (customerFields.twitterData) {
      previousEntry = await Customers.find({
        ...query,
        ["twitterData.id"]: customerFields.twitterData.id
      });

      if (previousEntry.length > 0) {
        throw new Error("Duplicated twitter");
      }
    }

    // Checking if customer has facebook data
    if (customerFields.facebookData) {
      previousEntry = await Customers.find({
        ...query,
        ["facebookData.id"]: customerFields.facebookData.id
      });

      if (previousEntry.length > 0) {
        throw new Error("Duplicated facebook");
      }
    }

    if (customerFields.primaryEmail) {
      // check duplication from primaryEmail
      previousEntry = await Customers.find({
        ...query,
        primaryEmail: customerFields.primaryEmail
      });

      if (previousEntry.length > 0) {
        throw new Error("Duplicated email");
      }

      // check duplication from emails
      previousEntry = await Customers.find({
        ...query,
        emails: { $in: [customerFields.primaryEmail] }
      });

      if (previousEntry.length > 0) {
        throw new Error("Duplicated email");
      }
    }

    if (customerFields.primaryPhone) {
      // check duplication from primaryPhone
      previousEntry = await Customers.find({
        ...query,
        primaryPhone: customerFields.primaryPhone
      });

      if (previousEntry.length > 0) {
        throw new Error("Duplicated phone");
      }

      // Check duplication from phones
      previousEntry = await Customers.find({
        ...query,
        phones: { $in: [customerFields.primaryPhone] }
      });

      if (previousEntry.length > 0) {
        throw new Error("Duplicated phone");
      }
    }
  }

  /**
   * Create a customer
   */
  public static async createCustomer(
    doc: ICreateCustomerInput,
    user?: IUserDocument
  ) {
    // Checking duplicated fields of customer
    await this.checkDuplication(doc);

    if (!doc.ownerId && user) {
      doc.ownerId = user._id;
    }

    // clean custom field values
    doc.customFieldsData = await Fields.cleanMulti(doc.customFieldsData || {});

    return Customers.create({
      createdAt: new Date(),
      modifiedAt: new Date(),
      ...doc
    });
  }

  /*
   * Update customer
   */
  public static async updateCustomer(_id: string, doc: ICreateCustomerInput) {
    // Checking duplicated fields of customer
    await this.checkDuplication(doc, _id);

    if (doc.customFieldsData) {
      // clean custom field values
      doc.customFieldsData = await Fields.cleanMulti(
        doc.customFieldsData || {}
      );
    }

    await Customers.update(
      { _id },
      { $set: { ...doc, modifiedAt: new Date() } }
    );

    return Customers.findOne({ _id });
  }

  /**
   * Mark customer as active
   */
  public static async markCustomerAsActive(customerId: string) {
    await Customers.update(
      { _id: customerId },
      { $set: { "messengerData.isActive": true } }
    );

    return Customers.findOne({ _id: customerId });
  }

  /**
   * Mark customer as inactive
   */
  public static async markCustomerAsNotActive(_id: string) {
    await Customers.findByIdAndUpdate(
      _id,
      {
        $set: {
          "messengerData.isActive": false,
          "messengerData.lastSeenAt": new Date()
        }
      },
      { new: true }
    );

    return Customers.findOne({ _id });
  }

  /*
   * Create new company and add to customer's company list
   */
  public static async addCompany({
    _id,
    name,
    website
  }: {
    _id: string;
    name: string;
    website: string;
  }) {
    // create company
    const company = await Companies.createCompany({ name, website });

    // add to companyIds list
    await Customers.findByIdAndUpdate(_id, {
      $addToSet: { companyIds: company._id }
    });

    return company;
  }

  /**
   * Update customer companies
   */
  public static async updateCompanies(_id: string, companyIds: string[]) {
    // updating companyIds field
    await Customers.findByIdAndUpdate(_id, { $set: { companyIds } });

    return Customers.findOne({ _id });
  }

  /**
   * Removes customer
   */
  public static async removeCustomer(customerId) {
    // Removing every modules that associated with customer
    await ActivityLogs.removeCustomerActivityLog(customerId);
    await Conversations.removeCustomerConversations(customerId);
    await EngageMessages.removeCustomerEngages(customerId);
    await InternalNotes.removeCustomerInternalNotes(customerId);

    return Customers.remove({ _id: customerId });
  }

  /**
   * Merge customers
   */
  public static async mergeCustomers(customerIds, customerFields) {
    // Checking duplicated fields of customer
    await Customers.checkDuplication(customerFields, customerIds);

    let tagIds = [];
    let companyIds = [];

    let emails = [];
    let phones = [];

    if (customerFields.primaryEmail) {
      emails.push(customerFields.primaryEmail);
    }

    if (customerFields.primaryPhone) {
      phones.push(customerFields.primaryPhone);
    }

    // Merging customer tags and companies
    for (const customerId of customerIds) {
      const customerObj = await Customers.findOne({ _id: customerId });

      if (customerObj) {
        // get last customer's integrationId
        customerFields.integrationId = customerObj.integrationId;

        const customerTags = customerObj.tagIds || [];
        const customerCompanies = customerObj.companyIds || [];

        // Merging customer's tag and companies into 1 array
        tagIds = tagIds.concat(customerTags);
        companyIds = companyIds.concat(customerCompanies);

        // Merging emails, phones
        emails = [...emails, ...(customerObj.emails || [])];
        phones = [...phones, ...(customerObj.phones || [])];

        // Removing Customers
        await Customers.remove({ _id: customerId });
      }
    }

    // Removing Duplicated Tags from customer
    tagIds = Array.from(new Set(tagIds));

    // Removing Duplicated Companies from customer
    companyIds = Array.from(new Set(companyIds));

    // Removing Duplicated Emails from customer
    emails = Array.from(new Set(emails));

    // Removing Duplicated Phones from customer
    phones = Array.from(new Set(phones));

    // Creating customer with properties
    const customer = await this.createCustomer({
      ...customerFields,
      tagIds,
      companyIds,
      emails,
      phones
    });

    // Updating every modules associated with customers
    await ActivityLogs.changeCustomer(customer._id, customerIds);
    await Conversations.changeCustomer(customer._id, customerIds);
    await EngageMessages.changeCustomer(customer._id, customerIds);
    await InternalNotes.changeCustomer(customer._id, customerIds);

    return customer;
  }

  /**
   * Imports customers with basic fields and custom properties
   */
  public static async bulkInsert(
    fieldNames: string[],
    fieldValues: string[],
    { user }: { user: IUserDocument }
  ) {
    const params = {
      fieldNames,
      fieldValues,
      user,
      basicInfos: CUSTOMER_BASIC_INFOS,
      contentType: "customer",
      create: this.createCustomer
    };

    return bulkInsert<ICustomerDocument, ICreateCustomerInput>(params);
  }
}

customerSchema.loadClass(Customer);

const Customers = model<ICustomerDocument, ICustomerModel>(
  "customers",
  customerSchema
);

export default Customers;

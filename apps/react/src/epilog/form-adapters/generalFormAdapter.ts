import {
    dateToString,
    stringToDate,
    timeOfDateToString,
    getFirstOrNextId,
    getNextId,
    getPolicyOfClaim,
    getExistingIds,
} from "../../utils/epilogUtils";
import { configs, FormConfig } from "./formConfigs";
import { CONTRACEPTIVE_OPTIONS, LOCATIONS, VACCINE_OPTIONS, VACCINE_HISTORY_OPTIONS } from "../../consts/options.const";

type Dataset = ReturnType<typeof definemorefacts>; 

interface BasicOption {
  id: string;
  label: string;
}

interface FormValues {
  person: BasicOption;
  policy: BasicOption;
  claim: BasicOption;
  [key: string]: any; 
}


class GeneralFormAdapter {
  private policyType: string;
  private dataset: Dataset;
  private claimId: string;
  private personId: string;
  private policyId: string;

  constructor(policyType: string, dataset: Dataset, claimId?: string, forceNewClaimId: boolean = false) {
    console.log(`Constructor called with claimId: ${claimId} and forceNewClaimId: ${forceNewClaimId}`);
    this.policyType = policyType;
    console.log("initial dataset", grindem(dataset));
    console.log("typeof dataset", typeof dataset);
    this.dataset = dataset; // Assume dataset is properly formatted as an object of arrays

    if (claimId && !forceNewClaimId) {
        this.claimId = claimId;
    } else {
        console.log("datasetArray before getnextId", grindem(dataset));
        console.log("existing ids check", getExistingIds("claim", dataset));
        this.claimId = getNextId("claim", dataset);
        console.log("claim Id after getnextId", this.claimId);
    }
    console.log("Initialized Claim ID:", this.claimId);
    this.personId = this.findOrAssignPersonId(dataset);
    this.policyId = getPolicyOfClaim(this.claimId, dataset) || getFirstOrNextId("policy", dataset);
}


private findOrAssignPersonId(dataset: Dataset): string {
    return getFirstOrNextId("person", dataset);
  }

  public refreshClaimId(): void {
    this.claimId = getNextId("claim", this.dataset); // Force new claim ID
  }

  public epilogToFormValues(epilogDataset: Dataset, claimId?: string): FormValues {
    if (this.claimId) {
        const claimExists = (compfinds("X", read(`claim(${claimId})`), epilogDataset, []) as string[]).length > 0;
        if (!claimExists) {
            console.debug("Claim ID not found in dataset, generating new ID");
            claimId = undefined;
        }
    }

    console.log("currentClaimId in epilogToFormValues", this.claimId);

    this.claimId = claimId || getNextId("claim", epilogDataset);

    let [personId] = compfinds("X", read(`claim.claimant(${this.claimId}, X)`), epilogDataset, []) as string[];
    if (!personId) personId = getFirstOrNextId("person", epilogDataset);

    let [dobString] = compfinds("X", read(`person.dob(${personId}, X)`), epilogDataset, []) as string[];
    const dob = dobString && dobString !== "nil" ? stringToDate(dobString) : null;

    let [isPersonImmunocompromised] = compfinds("X", read(`person.immunocompromised(${personId}, X)`), epilogDataset, []) as string[];

    let policyId = getPolicyOfClaim(this.claimId, epilogDataset);
    if (!policyId) policyId = getFirstOrNextId("policy", epilogDataset);

    const formConfig: FormConfig | undefined = configs[this.policyType];
    console.log("formConfig", formConfig);
    if (!formConfig) {
        throw new Error(`Form configuration not found for policy type '${this.policyType}'`);
    }

    const fields = formConfig.fields;
    console.log("fieldsInFormConfigs", fields);
    let formValues: FormValues = {
      person: { id: personId, label: personId },
      policy: { id: policyId, label: policyId },
      claim: { id: this.claimId, label: this.claimId },
      dob: dob,
      isPersonImmunocompromised: isPersonImmunocompromised ? { id: isPersonImmunocompromised, label: isPersonImmunocompromised } : null
    };

    fields.forEach(field => {
        console.log("field", field);
        console.log("field.mapping", field.mapping);
        let value = null;

            if(field.type === "date") {
                console.log("epilogDataset", epilogDataset);
                const [dateTimeResult] = compfinds(
                    read("time(Date, Time)"), // ["time", "24_05_13", "22_50"]
                    read(`claim.time(${this.claimId}, Date, Time)`),
                    epilogDataset,
                    [],
                  ) as [string, string, string][];

                  console.log("dateTimeResult", dateTimeResult);
              
                  value = dateTimeResult?.length === 3 && dateTimeResult[1] !== "nil" && dateTimeResult[2] !== "nil"
                    ? stringToDate(dateTimeResult[1], dateTimeResult[2])
                    : null;
                console.log("value after being converted", value);
              
            }
            else {
                value = 
                compfinds(
                    "X",
                    read(`claim.${field.mapping}(${claimId}, X)`),
                    epilogDataset,
                    [],
                  ) as string[];
            }


        formValues[field.id] = value;
    });

    console.log("Form Values on Initialization with New Claim ID:", formValues);
    return formValues;
  }



  public formValuesToEpilog(values: FormValues): string[][] {
    const formConfig: FormConfig | undefined = configs[this.policyType];
    if (!formConfig) {
      throw new Error(`Form configuration not found for policy type '${this.policyType}'`);
    }

    const personId = values.person.id;
    const dob = dateToString(values.dob);
    const isPersonImmunocompromised =
      values.isPersonImmunocompromised?.id || "nil";

    /* --------------------------------- Policy --------------------------------- */

    const policyId = values.policy.id;
    const policyType = values.policyType?.id || "nil";
    const fields = formConfig.fields;

    const claimId = values.claim.id;
    let epilogString = `person(${personId})`;

    epilogString += `policy(${policyId})`;
    epilogString += `claim(${claimId})`;
    epilogString += `person.occupation(${personId}, other)`;
    epilogString += `policy.type(${policyId}, ${policyType})`;
    epilogString += `policy.insuree(${policyId}, ${personId})`;
    epilogString += `policy.startdate(${policyId}, ${personId}, 01_08_2023)`;
    epilogString += `policy.enddate(${policyId}, ${personId}, 30_06_2024)`;
    epilogString += `claim.policy(${claimId}, ${policyId})`;

    console.log("formEpilogString after first adding something", epilogString);

    console.log("VALUESbeforeFIELDS", values);

    fields.forEach(field => {
        let value = values[field.id];
        const mapping = field.mapping
        console.log("mapping", mapping);
        const mapping_array = mapping.split(".");
        console.log("mapping_array", mapping_array);

        switch (field.type) {
            case 'date':
                const whenDate = value;
                const whenDateStr = dateToString(whenDate);
                const whenTimeStr = timeOfDateToString(whenDate);
                console.log("entered date case", value, field.type);
                value = value instanceof Date ? dateToString(value) : (value ? timeOfDateToString(value) : "nil");
                console.log("valueAfterSetting", value);
                epilogString += `${field.mapping}(${claimId}, ${whenDateStr}, ${whenTimeStr})\n`;
                break;
            case 'select':
                console.log("entered select case", value);
                if (value && value.length > 0) {
                    let key_search = "label";
                    if ("value" in value[0]) {
                        key_search = "value";
                    }
                    value = value[0][key_search];
                    console.log("value[0][value]", value);
                    const mapping_type = mapping_array[0];
                    if (mapping_type == "person") {
                        epilogString += `${field.mapping}(${personId}, ${value})\n`;
                    }
                    if (mapping_type == "claim") {
                        epilogString += `${field.mapping}(${claimId}, ${value})\n`;
                    }
                    if (mapping_type == "policy") {
                        epilogString += `${field.mapping}(${policyId}, ${value})\n`;
                    }
                } else {
                    value = "nil"
                }
                break;
            case 'array':
                console.log("entered array case", value, field.type);
                value = (value.id || value);
                console.log("valIdExists", (value.id || value));
                if (value.length > 0) {
                    console.log("enters val exist case", field.label);
                    if (field.label == "Vaccination History") {
                        console.log("enters Vaccination History field.label", field.label);
                        const getCount = (
                            typesArray: BasicOption[],
                            vaccine: "pfizer" | "moderna" | "other" | "new_formulation",
                          ) => typesArray.filter((v) => v.id === vaccine).length;
                      
                          const vaccinationHistory_vaccineTypes_pfizer = getCount(
                            values.vaccinationHistory_vaccineTypes,
                            "pfizer",
                          );
                      
                          const vaccinationHistory_vaccineTypes_moderna = getCount(
                            values.vaccinationHistory_vaccineTypes,
                            "moderna",
                          );
                          const vaccinationHistory_vaccineTypes_other = getCount(
                            values.vaccinationHistory_vaccineTypes,
                            "other",
                          );
                      
                          const vaccinationHistory_vaccineTypes_new_formulation = getCount(
                            values.vaccinationHistory_vaccineTypes,
                            "new_formulation",
                          );

                          epilogString += `claim.vaccine_dose_count(${claimId}, ${vaccinationHistory_vaccineTypes_new_formulation})\n`;
                          epilogString += `claim.previous_vaccines_pfizer(${claimId}, ${vaccinationHistory_vaccineTypes_pfizer})\n`;
                          epilogString += `claim.previous_vaccines_moderna(${claimId}, ${vaccinationHistory_vaccineTypes_moderna})\n`;
                          epilogString += `claim.previous_vaccines_other(${claimId}, ${vaccinationHistory_vaccineTypes_other})\n`;

                    } else {
                        value = value.map(item => item.id || "nil").join(", ")
                        epilogString += `${field.mapping}(${claimId}, ${value})\n`;
                    }
                } else {
                    value = "nil";
                }
                //value = (value && value.length > 0) ? value.map(item => item.id || "nil").join(", ") : "nil";
                //console.log("valueAfterSetting", value);
                //epilogString += `${field.mapping}(${this.claimId}, ${value})\n`;
                break;
            case 'text':
            case 'number':
            case 'checkbox':
                console.log("entered checkbox case", value, field.type);
                value = (value !== null && value !== undefined) ? value.toString() : "nil";
                console.log("valueAfterSetting", value);
                epilogString += `${field.mapping}(${claimId}, ${value})\n`;
                break;
            default:
                console.log("entered nil case", value, field.type);
                value = "nil";
                epilogString += `${field.mapping}(${claimId}, ${value})\n`;
        }
    });

    console.log("epilogStringAfterAddingEverything", epilogString);


    const formDataset = readdata(epilogString);
    console.log("Parsed Dataset:", formDataset);


    return formDataset;
}
}

export default GeneralFormAdapter;

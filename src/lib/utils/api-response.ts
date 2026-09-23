export type TApiResponse<T> = {
  success: boolean;
  message: string;
  code: number;
  data: T;
};

export function apiResponse<T>(data: T, message = "Success", code = 200): TApiResponse<T> {
  return {
    success: true,
    message,
    code,
    data,
  };
}
